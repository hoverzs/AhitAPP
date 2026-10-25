import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildDevotionalMemory,
  mergeStoredMetaIntoMemory,
} from "../src/lib/devotional-memory";
import {
  EXPORT_FILE_VERSION,
  buildMigrationMeta,
  importToBlob,
  planMigration,
  verifyImport,
  type ExportFile,
} from "../src/lib/migration/redis-to-blob";
import {
  evaluatePreflight,
  preflightHasFailures,
} from "../src/lib/migration/preflight";
import { BLOB_PATHS, createBlobStorage } from "../src/lib/storage/blob/blob-storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { parseDevotionalList } from "../src/lib/storage/devotional-validate";
import type { Devotional } from "../src/lib/types";

const TODAY = "2026-10-24"; // cutoff: 2026-10-17

function devotional(
  n: number,
  date: string,
  overrides: Partial<Devotional> = {}
): Devotional {
  return {
    date,
    title: `Cím ${n}`,
    verse: `Róma ${n}:1 — teszt vers`,
    content: `## Tartalom\n\nSzöveg ${date}`,
    imageUrl: "https://images.pexels.com/photos/1/a.jpeg",
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
    ...overrides,
  };
}

/** A Redis egy tipikus, ~148 napos állapotának kicsinyített mása. */
function sourceRecords(): Devotional[] {
  return [
    devotional(1, "2026-05-29"), // régi, közzétett → nem kerül át
    devotional(2, "2026-09-14", { verse: "Máté 5:3 — boldogok" }), // régi, közzétett
    devotional(3, "2026-10-05", { status: "draft" }), // régi piszkozat → átkerül
    devotional(4, "2026-10-17"), // a határ napja → átkerül
    devotional(5, "2026-10-22", { versionHistory: [{ savedAt: "x", reason: "regenerate", title: "t", verse: "v", content: "régi" }] as never }),
    devotional(6, "2026-10-24", { imageUrl: "/images/devotionals/day-6.jpg" }), // helyi kép → figyelmeztetés
    devotional(7, "2026-10-26", { status: "draft" }), // jövőbeli piszkozat
  ];
}

function freshStorage() {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => TODAY });
  return { client, storage };
}

test("terv: a retention által megtartott rekordok kerülnek át, a régi közzétettek nem", () => {
  const plan = planMigration(sourceRecords(), TODAY);

  assert.equal(plan.totalRecords, 7);
  assert.deepEqual(plan.toImport.map((d) => d.title), ["Cím 3", "Cím 4", "Cím 5", "Cím 6", "Cím 7"]);
  assert.deepEqual(plan.skippedOldPublished, ["2026-05-29", "2026-09-14"]);
  assert.deepEqual(plan.oldUnpublishedKept, ["2026-10-05"]);
  assert.equal(plan.cutoff, "2026-10-17");
  assert.equal(plan.newestDate, "2026-10-26");
});

test("terv: a meta a TELJES előzményből épül, a nem átvitt napokból is", () => {
  const plan = planMigration(sourceRecords(), TODAY);

  assert.ok(plan.meta.usedVerseReferences?.includes("Máté 5:3"), "a kihagyott 2. nap igehelye megvan");
  assert.ok(plan.meta.usedTitles?.includes("Cím 1"));
  assert.equal(plan.meta.recentDays?.length, 7);

  const direct = buildMigrationMeta(sourceRecords());
  assert.deepEqual(direct.usedCategories, ["Hit"]);
});

test("terv: figyelmeztet a helyi képútvonalra és a duplikátumokra", () => {
  const plan = planMigration(
    [...sourceRecords(), devotional(6, "2026-10-25")],
    TODAY
  );
  assert.ok(plan.warnings.some((w) => w.includes("/images/devotionals/day-6.jpg")));

  const dup = planMigration([devotional(1, "2026-10-24"), devotional(2, "2026-10-24")], TODAY);
  assert.ok(dup.warnings.some((w) => w.includes("Duplikált dátum")));
});

test("import: száraz próba nem ír; az éles import minden tervezett napot beír", async () => {
  const { client, storage } = freshStorage();
  const plan = planMigration(sourceRecords(), TODAY);

  const dry = await importToBlob(storage, plan, { dryRun: true });
  assert.equal(dry.imported.length, 5);
  assert.equal(dry.metaMerged, false);
  assert.deepEqual(client.paths(), []); // semmi nem íródott

  const result = await importToBlob(storage, plan);
  assert.equal(result.imported.length, 5);
  assert.equal(result.metaMerged, true);
  assert.equal(client.has(BLOB_PATHS.record("2026-10-22")), true);
  assert.equal(client.has(BLOB_PATHS.record("2026-05-29")), false); // régi, közzétett: nem kerül át
});

test("import: idempotens, és a már létező napot soha nem írja felül", async () => {
  const { storage } = freshStorage();
  const plan = planMigration(sourceRecords(), TODAY);
  await importToBlob(storage, plan);

  // Az élő rendszerben közben szerkesztették az egyik napot.
  const live = (await storage.getDevotionalByDate("2026-10-22"))!;
  await storage.updateDevotional("2026-10-22", { ...live, title: "Közben szerkesztett cím" });

  const again = await importToBlob(storage, plan);
  assert.equal(again.imported.length, 0);
  assert.equal(again.skippedExisting.length, 5);
  assert.equal((await storage.getDevotionalByDate("2026-10-22"))?.title, "Közben szerkesztett cím");
});

test("ellenőrzés: sikeres import után minden vizsgálat OK", async () => {
  const { storage } = freshStorage();
  const plan = planMigration(sourceRecords(), TODAY);
  await importToBlob(storage, plan);

  const verified = await verifyImport(storage, plan, TODAY);
  assert.equal(verified.ok, true, JSON.stringify(verified.checks.filter((c) => !c.ok)));
  assert.equal(verified.checks.length, 4);
});

test("ellenőrzés: kimutatja a hiányzó rekordot, az eltérő tartalmat, a hiányzó pillanatképet és metát", async () => {
  const plan = planMigration(sourceRecords(), TODAY);

  // 1) törölt rekord
  {
    const { client, storage } = freshStorage();
    await importToBlob(storage, plan);
    client.remove(BLOB_PATHS.record("2026-10-22"));
    const v = await verifyImport(storage, plan, TODAY);
    assert.equal(v.ok, false);
    assert.equal(v.checks.find((c) => c.name.startsWith("rekordok"))?.ok, false);
  }
  // 2) módosított tartalom
  {
    const { storage } = freshStorage();
    await importToBlob(storage, plan);
    const d = (await storage.getDevotionalByDate("2026-10-22"))!;
    await storage.updateDevotional("2026-10-22", { ...d, content: "megváltozott" });
    const v = await verifyImport(storage, plan, TODAY);
    assert.equal(v.ok, false);
    assert.match(v.checks.find((c) => c.name.startsWith("rekordok"))?.detail ?? "", /content/);
  }
  // 3) hiányzó pillanatkép
  {
    const { client, storage } = freshStorage();
    await importToBlob(storage, plan);
    client.remove(BLOB_PATHS.publicWindow);
    const v = await verifyImport(storage, plan, TODAY);
    assert.equal(v.checks.find((c) => c.name.startsWith("nyilvános"))?.ok, false);
  }
  // 4) hiányzó meta
  {
    const { client, storage } = freshStorage();
    await importToBlob(storage, plan);
    client.remove(BLOB_PATHS.meta);
    const v = await verifyImport(storage, plan, TODAY);
    assert.equal(v.checks.find((c) => c.name.startsWith("meta"))?.ok, false);
  }
});

test("import után a retention nem talál törlendőt, a régi piszkozat marad", async () => {
  const { storage } = freshStorage();
  await importToBlob(storage, planMigration(sourceRecords(), TODAY));

  const preview = await storage.runRetention({ apply: false });
  assert.deepEqual(preview.removable, []);
  assert.deepEqual(preview.keptUnpublished, ["2026-10-05"]);
});

test("a nem átvitt napok emlékezete az átállás után a generálási memóriában megmarad", async () => {
  const { storage } = freshStorage();
  await importToBlob(storage, planMigration(sourceRecords(), TODAY));

  const history = await storage.getLatestDevotionals();
  const memory = mergeStoredMetaIntoMemory(
    buildDevotionalMemory(history, { targetDate: "2026-10-27" }),
    await storage.getMeta()
  );

  assert.ok(memory.usedVerseReferences.includes("Máté 5:3"), "a nem átvitt 2. nap igehelye használtnak számít");
  assert.ok(memory.usedTitles.includes("Cím 1"));
  assert.equal(memory.targetDate, "2026-10-27");
});

test("B forgatókönyv: a használt igehelyek beállíthatók, a meta nem szűkül", async () => {
  const { storage } = freshStorage();

  await storage.mergeMeta({ usedVerseReferences: ["Zsolt 23:1", "Ján 3:16"] });
  let meta = await storage.getMeta();
  assert.deepEqual(meta?.usedVerseReferences, ["Zsolt 23:1", "Ján 3:16"]);

  // Új ige hozzáadódik, duplikátum nincs.
  await storage.mergeMeta({ usedVerseReferences: ["Ján 3:16", "Róma 8:28"] });
  meta = await storage.getMeta();
  assert.deepEqual(meta?.usedVerseReferences, ["Zsolt 23:1", "Ján 3:16", "Róma 8:28"]);

  // Napszám nélkül is működik: a generálás csak a használt igehelyeket nézi.
  const memory = mergeStoredMetaIntoMemory(buildDevotionalMemory([], { targetDate: "2026-10-27" }), meta);
  assert.ok(memory.usedVerseReferences.includes("Róma 8:28"));
});

test("export-fájl: körbejárás után a rekordok (versionHistory-val együtt) változatlanok", () => {
  const records = sourceRecords();
  const file: ExportFile = {
    version: EXPORT_FILE_VERSION,
    exportedAt: "2026-10-24T10:00:00.000Z",
    referenceDate: TODAY,
    source: "redis",
    records,
  };
  const roundTripped = parseDevotionalList(JSON.parse(JSON.stringify(file)).records);
  assert.equal(roundTripped.length, records.length);
  assert.equal(roundTripped.find((d) => d.title === "Cím 5")?.versionHistory?.length, 1);
});

test("az export-szkript semmilyen író Redis-műveletet nem tartalmaz", () => {
  const source = readFileSync("scripts/redis-to-blob.ts", "utf-8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.trim().startsWith("/*"))
    .join("\n");

  for (const forbidden of [
    "raw.set(", "raw.del(", "raw.zadd(", "raw.zrem(", "raw.flushdb", "raw.flushall",
    "raw.expire(", "raw.hset(", "raw.incr(", "raw.pipeline(", "raw.eval(",
  ]) {
    assert.equal(code.includes(forbidden), false, `tiltott művelet: ${forbidden}`);
  }
  // Csak a két olvasó művelet hívódik a nyers kliensen.
  const rawCalls = [...code.matchAll(/raw\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rawCalls)].sort(), ["mget", "zrange"]);
});

// --- Preflight ---

const GOOD_ENV = {
  BLOB_DATA_STORE_ID: "store_data",
  BLOB_IMAGES_STORE_ID: "store_images",
  KV_REST_API_URL: "https://x.upstash.io",
  KV_REST_API_TOKEN: "t",
  CRON_SECRET: "titkos-cron-kulcs",
  ADMIN_PASSWORD: "egy-eleg-hosszu-jelszo",
  NEXT_PUBLIC_SITE_URL: "https://ahit-app.vercel.app",
};
const CRONS = ["/api/cron/generate-devotional", "/api/cron/prune-devotionals"];

test("preflight: jó konfigurációra nincs hiba és figyelmeztetés", () => {
  const items = evaluatePreflight(GOOD_ENV, { cronPaths: CRONS });
  assert.equal(preflightHasFailures(items), false);
  assert.deepEqual(items.filter((i) => i.status !== "ok"), []);
});

test("preflight: hibát jelez a hiányzó adat store, titkok, URL és cron", () => {
  const items = evaluatePreflight({}, { cronPaths: [] });
  const failed = items.filter((i) => i.status === "fail").map((i) => i.id).sort();
  assert.deepEqual(failed, [
    "admin-password",
    "cron-secret",
    "cron:/api/cron/generate-devotional",
    "cron:/api/cron/prune-devotionals",
    "data-store",
    "site-url",
  ]);
});

test("preflight: azonos adat és képtár store tiltott; alapértelmezett és rövid jelszó jelezve", () => {
  const same = evaluatePreflight({ ...GOOD_ENV, BLOB_IMAGES_STORE_ID: "store_data" }, { cronPaths: CRONS });
  assert.equal(same.find((i) => i.id === "stores-distinct")?.status, "fail");

  const sameToken = evaluatePreflight(
    { ...GOOD_ENV, BLOB_DATA_STORE_ID: undefined, BLOB_READ_WRITE_TOKEN: "tok", BLOB_IMAGES_STORE_ID: undefined, BLOB_IMAGES_READ_WRITE_TOKEN: "tok" },
    { cronPaths: CRONS }
  );
  assert.equal(sameToken.find((i) => i.id === "stores-distinct")?.status, "fail");

  assert.equal(
    evaluatePreflight({ ...GOOD_ENV, ADMIN_PASSWORD: "devotional-admin" }).find((i) => i.id === "admin-password")?.status,
    "fail"
  );
  assert.equal(
    evaluatePreflight({ ...GOOD_ENV, ADMIN_PASSWORD: "rovid" }).find((i) => i.id === "admin-password")?.status,
    "warn"
  );
});

test("preflight: figyelmeztet a bekapcsolt automatikus törlésre, eltérő megőrzésre, képtár és Redis hiányára", () => {
  const items = evaluatePreflight(
    {
      ...GOOD_ENV,
      DEVOTIONAL_RETENTION_AUTO_DELETE: "true",
      DEVOTIONAL_RETENTION_DAYS: "30",
      BLOB_IMAGES_STORE_ID: undefined,
      KV_REST_API_URL: undefined,
    },
    { cronPaths: CRONS }
  );
  const status = (id: string) => items.find((i) => i.id === id)?.status;
  assert.equal(status("auto-delete"), "warn");
  assert.equal(status("retention-days"), "warn");
  assert.equal(status("images-store"), "warn");
  assert.equal(status("rollback"), "warn");
  assert.equal(preflightHasFailures(items), false); // csak figyelmeztetés
});

test("preflight: STORAGE_DRIVER=blob esetén jelzi az aktív meghajtót", () => {
  const items = evaluatePreflight({ ...GOOD_ENV, STORAGE_DRIVER: "blob" }, { cronPaths: CRONS });
  assert.match(items.find((i) => i.id === "driver")?.message ?? "", /aktív meghajtó/);
});
