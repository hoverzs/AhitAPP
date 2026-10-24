/**
 * Régi (7 napnál régebbi) KÖZZÉTETT áhítatok előnézete / törlése — az áhítat
 * DÁTUMA alapján (Europe/Bucharest nap). Piszkozat, jóváhagyott, jövőbeli és
 * a legfrissebb rekord soha nem törlődik. Ugyanazt a logikát használja, mint a
 * napi cron (/api/cron/prune-devotionals).
 *
 *   npx tsx scripts/retention.ts                    # előnézet, SEMMIT nem töröl
 *   npx tsx scripts/retention.ts --source=local     # data/devotionals.json alapján (Redis nélkül)
 *   npx tsx scripts/retention.ts --env-file=.env.production.local
 *   npx tsx scripts/retention.ts --apply --confirm=DELETE-<darabszám>
 *
 * (npm run retention:preview / retention:apply ugyanezt hívja; npm alatt a
 *  kapcsolókat `--` után add meg.)
 *
 * Törlés előtt JSON mentés készül a backups/ mappába. Csak saját kulcsokat érint:
 * ahitapp:devotional:index (tagok), ahitapp:devotional:data:<dátum>,
 * ahitapp:generation:job:<dátum>.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { getAppTodayIso } from "../src/lib/app-date";
import { normalizeDevotionalStatus } from "../src/lib/devotional-status";
import { runDevotionalRetention } from "../src/lib/storage/redis-storage";
import { planRetention } from "../src/lib/storage/retention";

const DATA_PREFIX = "ahitapp:devotional:data:";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function loadEnv() {
  const explicit = arg("env-file");
  for (const file of explicit ? [explicit] : [".env.local"]) {
    if (existsSync(file)) process.loadEnvFile(file);
    else if (explicit) throw new Error(`Env fájl nem található: ${file}`);
  }
}

interface Summary {
  referenceDate: string;
  retentionDays: number;
  cutoff: string | null;
  removable: string[];
  keptUnpublished: string[];
}

function print(summary: Summary, total: number, source: string) {
  console.log(`Forrás:               ${source}`);
  console.log(`Mai dátum:            ${summary.referenceDate} (Europe/Bucharest)`);
  console.log(
    `Megőrzés:             ${summary.retentionDays} nap` +
      (summary.cutoff ? ` → legkorábbi megmaradó dátum: ${summary.cutoff}` : " (kikapcsolva)")
  );
  console.log(`Vizsgált rekord:      ${total}`);
  console.log(`TÖRLÉSRE JELÖLT:      ${summary.removable.length}  (régi + közzétett)`);
  if (summary.removable.length) {
    console.log(`  legrégebbi:         ${summary.removable[0]}`);
    console.log(`  legújabb:           ${summary.removable[summary.removable.length - 1]}`);
    console.log(`  dátumok:            ${summary.removable.join(", ")}`);
  }
  console.log(`Régi, de MEGMARAD (nem közzétett): ${summary.keptUnpublished.length}`);
  if (summary.keptUnpublished.length) {
    console.log(`  dátumok:            ${summary.keptUnpublished.join(", ")}`);
  }
}

async function main() {
  loadEnv();
  const apply = flag("apply");
  const source = arg("source") ?? "redis";

  if (source === "local") {
    const raw = JSON.parse(readFileSync(path.join("data", "devotionals.json"), "utf-8")) as {
      date?: string;
      createdAt: string;
      status?: string;
    }[];
    const rows = raw.map((d) => ({
      date: d.date ?? d.createdAt.slice(0, 10),
      published: normalizeDevotionalStatus(d.status as never) === "published",
    }));
    const plan = planRetention(rows.map((r) => r.date), getAppTodayIso());
    const published = new Set(rows.filter((r) => r.published).map((r) => r.date));
    print(
      {
        referenceDate: plan.referenceDate,
        retentionDays: plan.retentionDays,
        cutoff: plan.cutoff,
        removable: plan.remove.filter((d) => published.has(d)),
        keptUnpublished: plan.remove.filter((d) => !published.has(d)),
      },
      rows.length,
      "data/devotionals.json"
    );
    console.log("\nLokális előnézet — nem töröl semmit.");
    return;
  }

  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    console.error("Redis nincs konfigurálva (KV_REST_API_URL / KV_REST_API_TOKEN). Használd: --env-file=... vagy --source=local");
    process.exit(1);
  }

  let preview;
  try {
    preview = await runDevotionalRetention({ apply: false });
  } catch (error) {
    console.error("A Redis jelenleg nem fogad parancsokat:", error instanceof Error ? error.message : error);
    console.error("Oldd fel az Upstash korlátot (Console → Database → Usage/Details), majd futtasd újra.");
    process.exit(2);
  }
  print(preview, preview.removable.length + preview.keptUnpublished.length, "Upstash Redis");

  if (!apply) {
    console.log(
      `\nELŐNÉZET — nem törölt semmit. Törléshez: npx tsx scripts/retention.ts --apply --confirm=DELETE-${preview.removable.length}`
    );
    return;
  }
  if (preview.removable.length === 0) {
    console.log("\nNincs törlendő áhítat.");
    return;
  }
  if (arg("confirm") !== `DELETE-${preview.removable.length}`) {
    console.error(`\nMegerősítés hiányzik/eltér. Add meg: --confirm=DELETE-${preview.removable.length}`);
    process.exit(1);
  }

  // Mentés törlés előtt
  const redis = new Redis({ url, token });
  const records: unknown[] = [];
  for (let i = 0; i < preview.removable.length; i += 50) {
    const part = preview.removable.slice(i, i + 50);
    records.push(...(await redis.mget<unknown[]>(...part.map((d) => DATA_PREFIX + d))));
  }
  mkdirSync("backups", { recursive: true });
  const backupFile = path.join("backups", `retention-${preview.referenceDate}-${Date.now()}.json`);
  writeFileSync(backupFile, JSON.stringify({ dates: preview.removable, records }, null, 2), "utf-8");
  console.log(`\nMentés kész: ${backupFile}`);

  const done = await runDevotionalRetention({ apply: true });
  console.log(`Törölve: ${done.deleted ? done.removable.length : 0} áhítat (index + adat + generálási feladat kulcsok).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
