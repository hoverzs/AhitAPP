/**
 * Redis → Vercel Blob átvitel (E fázis). Két külön lépés, SOHA nem egy futásban:
 *
 * 1) EXPORT — csak olvas a Redisből (ZRANGE + MGET), helyi fájlba ment:
 *      npx tsx scripts/redis-to-blob.ts --env-file=.env.production.local
 *    → exports/redis-export-<idő>.json + terv (mit visz át, mit nem). A Redis
 *      érintetlen marad; a szkript a Redis-kliensnek csak olvasó műveleteit éri el.
 *
 * 2) IMPORT — fájlból ír az ÚJ, üres Blob adat store-ba (nem olvas Redisből):
 *      npx tsx scripts/redis-to-blob.ts --import --from-file=exports/<fájl>.json --env-file=.env.blob.local
 *      npx tsx scripts/redis-to-blob.ts --import --from-file=... --confirm=IMPORT-<n>
 *    Confirm nélkül csak száraz próba. Nem üres store-ba csak --allow-nonempty-vel
 *    ír, és a már létező napot soha nem írja felül. Írás után automatikus ellenőrzés.
 *
 *    --verify --from-file=...        csak ellenőrzi a Blobot a fájlhoz képest
 *
 * 3) B forgatókönyv (a Redis nem érhető el, tiszta lap):
 *      npx tsx scripts/redis-to-blob.ts --seed-meta --max-day=<utolsó napszám> [--used-verses-file=igek.txt] --confirm=SEED-<n>
 *    Beállítja az utolsó napszámot (a /nap/<n> linkek folytonosságához) és
 *    opcionálisan a már használt igehelyeket (soronként egy).
 *
 * Átvitelre kerül minden, amit a retention is megtartana: a mai nap + 7 nap,
 * a jövőbeli és minden nem közzétett (piszkozat) rekord, valamint a legfrissebb.
 * A régi, közzétett napok nem kerülnek át, de az igehelyeik, címeik, kategóriáik
 * és a napszám a metába bekerülnek (a generálás ismétlés-védelméhez).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { getAppTodayIso } from "../src/lib/app-date";
import {
  EXPORT_FILE_VERSION,
  importToBlob,
  planMigration,
  verifyImport,
  type ExportFile,
  type MigrationPlan,
} from "../src/lib/migration/redis-to-blob";
import { createBlobStorage } from "../src/lib/storage/blob/blob-storage";
import {
  BLOB_ACCESS,
  getDataBlobAuth,
  isBlobStorageConfigured,
} from "../src/lib/storage/blob/config";
import { createVercelBlobClient } from "../src/lib/storage/blob/vercel-client";
import { parseDevotionalList } from "../src/lib/storage/devotional-validate";

const INDEX_KEY = "ahitapp:devotional:index";
const DATA_PREFIX = "ahitapp:devotional:data:";
const MGET_CHUNK = 25;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function loadEnv() {
  const explicit = arg("env-file");
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Env fájl nem található: ${explicit}`);
    process.loadEnvFile(explicit);
  } else if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

function printPlan(plan: MigrationPlan) {
  console.log(`Mai dátum:                 ${plan.referenceDate} (Europe/Bucharest)`);
  console.log(`Megőrzési határ:           ${plan.cutoff ?? "(nincs)"}`);
  console.log(`Rekordok a forrásban:      ${plan.totalRecords}`);
  console.log(`ÁTVITELRE KERÜL:           ${plan.toImport.length}`);
  for (const d of plan.toImport) {
    console.log(`  #${d.dayNumber}  ${d.date ?? ""}  ${d.status ?? "published"}  ${d.title}`);
  }
  console.log(`Átvitel nélkül (régi, közzétett): ${plan.skippedOldPublished.length}`);
  if (plan.oldUnpublishedKept.length) {
    console.log(`Régi, de nem közzétett (átkerül): ${plan.oldUnpublishedKept.join(", ")}`);
  }
  console.log(`Legutóbbi nap:             ${plan.newestDate ?? "-"} (napszám: ${plan.maxDayNumber})`);
  console.log(
    `Meta (törölt napok emlékezete): ${plan.meta.usedVerseReferences?.length ?? 0} igehely, ` +
      `${plan.meta.usedTitles?.length ?? 0} cím, ${plan.meta.usedCategories?.length ?? 0} kategória`
  );
  for (const w of plan.warnings) console.log(`FIGYELEM: ${w}`);
}

function readExportFile(file: string): ExportFile {
  const parsed = JSON.parse(readFileSync(file, "utf-8")) as ExportFile;
  if (parsed.version !== EXPORT_FILE_VERSION || !Array.isArray(parsed.records)) {
    throw new Error("Ismeretlen export-fájl formátum.");
  }
  return { ...parsed, records: parseDevotionalList(parsed.records) };
}

function openBlobStorage() {
  if (!isBlobStorageConfigured()) {
    console.error(
      "A Blob adat store nincs konfigurálva (BLOB_DATA_STORE_ID / BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN). Használd: --env-file=..."
    );
    process.exit(1);
  }
  return createBlobStorage(
    createVercelBlobClient({ access: BLOB_ACCESS.data, ...getDataBlobAuth() })
  );
}

/** 1) Export: csak olvasó Redis-műveletek. */
async function runExport() {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    console.error("Redis nincs konfigurálva (KV_REST_API_URL / KV_REST_API_TOKEN). Használd: --env-file=...");
    process.exit(1);
  }

  // Szándékosan csak olvasó felület: a Redis-kliens többi művelete nem érhető el.
  const raw = new Redis({ url, token });
  const readOnly = {
    index: () => raw.zrange<(string | number)[]>(INDEX_KEY, 0, -1, { withScores: true }),
    mget: (keys: string[]) => raw.mget<unknown[]>(...keys),
  };

  let dates: string[];
  try {
    const entries = await readOnly.index();
    dates = [];
    for (let i = 0; i < entries.length; i += 2) dates.push(String(entries[i]));
  } catch (error) {
    console.error("A Redis jelenleg nem fogad parancsokat:", error instanceof Error ? error.message : error);
    console.error("Oldd fel az Upstash korlátot (Console → Usage), majd futtasd újra — vagy használd a --seed-meta módot (B forgatókönyv).");
    process.exit(2);
  }

  const rawRecords: unknown[] = [];
  for (let i = 0; i < dates.length; i += MGET_CHUNK) {
    const keys = dates.slice(i, i + MGET_CHUNK).map((d) => DATA_PREFIX + d);
    rawRecords.push(...(await readOnly.mget(keys)));
  }

  const missing = dates.filter((_, i) => rawRecords[i] == null);
  const records = parseDevotionalList(rawRecords.filter((r) => r != null));
  const today = getAppTodayIso();

  const file: ExportFile = {
    version: EXPORT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    referenceDate: today,
    source: "redis",
    records,
  };

  mkdirSync("exports", { recursive: true });
  const out = path.join("exports", `redis-export-${today}-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify(file), "utf-8");

  console.log(`Export kész: ${out}  (${records.length} rekord, a Redisben ${dates.length} index-tag)`);
  if (missing.length) console.log(`FIGYELEM: az indexben szerepel, de nincs adata: ${missing.join(", ")}`);
  if (records.length < dates.length - missing.length) {
    console.log("FIGYELEM: néhány rekord nem érvényes, kimaradt az exportból.");
  }
  console.log("");
  printPlan(planMigration(records, today));
  console.log("\nA Redisben semmi nem változott. Következő lépés: --import (a fájlból, az új Blob store-ba).");
}

/** 2) Import / verify: fájlból, a Blobba. */
async function runImport() {
  const fromFile = arg("from-file");
  if (!fromFile) {
    console.error("Add meg az export fájlt: --from-file=exports/<fájl>.json");
    process.exit(1);
  }
  const file = readExportFile(fromFile);
  const today = getAppTodayIso();
  const plan = planMigration(file.records, today);
  const storage = openBlobStorage();

  printPlan(plan);

  if (flag("verify")) {
    const verified = await verifyImport(storage, plan, today);
    for (const c of verified.checks) console.log(`${c.ok ? "OK  " : "HIBA"} ${c.name}${c.detail ? " — " + c.detail : ""}`);
    process.exit(verified.ok ? 0 : 1);
  }

  const existing = await storage.listAdminEntries("0000-00-00");
  if (existing.length > 0 && !flag("allow-nonempty")) {
    console.error(
      `\nA Blob adat store NEM üres (${existing.length} bejegyzés). Éles adat védelme: add meg --allow-nonempty-t, ha ez szándékos (a létező napokat akkor sem írja felül).`
    );
    process.exit(1);
  }

  const expected = `IMPORT-${plan.toImport.length}`;
  const confirmed = arg("confirm") === expected;
  const dry = await importToBlob(storage, plan, { dryRun: true });
  console.log(
    `\nBlobba kerülne: ${dry.imported.length} nap, már létezik (kihagyva): ${dry.skippedExisting.length}`
  );

  if (!confirmed) {
    console.log(`\nSZÁRAZ PRÓBA — nem írt semmit. Íráshoz: --confirm=${expected}`);
    return;
  }

  const result = await importToBlob(storage, plan);
  console.log(`\nÍrva: ${result.imported.length} nap, kihagyva (már létezett): ${result.skippedExisting.length}, meta beolvasztva: ${result.metaMerged}`);

  const verified = await verifyImport(storage, plan, today);
  for (const c of verified.checks) console.log(`${c.ok ? "OK  " : "HIBA"} ${c.name}${c.detail ? " — " + c.detail : ""}`);
  process.exit(verified.ok ? 0 : 1);
}

/** 3) Tiszta lap: csak az utolsó napszám és a használt igehelyek. */
async function runSeedMeta() {
  const maxDay = Number(arg("max-day"));
  if (!Number.isInteger(maxDay) || maxDay < 0) {
    console.error("Add meg az utolsó napszámot: --max-day=<szám>");
    process.exit(1);
  }
  const versesFile = arg("used-verses-file");
  const verses = versesFile
    ? readFileSync(versesFile, "utf-8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [];

  const storage = openBlobStorage();
  console.log(`Seed: utolsó napszám = ${maxDay}, használt igehelyek: ${verses.length}`);
  console.log("A következő generált nap napszáma: " + (maxDay + 1));

  if (arg("confirm") !== `SEED-${maxDay}`) {
    console.log(`\nSZÁRAZ PRÓBA — nem írt semmit. Íráshoz: --confirm=SEED-${maxDay}`);
    return;
  }
  const meta = await storage.mergeMeta({ maxDayNumber: maxDay, usedVerseReferences: verses });
  console.log(`Meta beállítva: maxDayNumber=${meta.maxDayNumber}, igehelyek=${meta.usedVerseReferences.length}`);
}

async function main() {
  loadEnv();
  if (flag("seed-meta")) return runSeedMeta();
  if (flag("import") || flag("verify")) return runImport();
  return runExport();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
