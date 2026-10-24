/**
 * 60 napnál régebbi áhítatok előnézete / törlése (az áhítat DÁTUMA alapján).
 *
 *   npm run retention:preview                    # csak olvas, SEMMIT nem töröl
 *   npm run retention:preview -- --source=local  # data/devotionals.json alapján (Redis nélkül)
 *   npm run retention:preview -- --env-file=.env.production.local
 *   npm run retention:apply -- --confirm=DELETE-<darabszám>   # tényleges törlés
 *
 * Redis env: KV_REST_API_URL + KV_REST_API_TOKEN (vagy UPSTASH_REDIS_REST_*).
 * A törlés előtt a rekordokról JSON mentés készül a backups/ mappába.
 * Csak ezeket a kulcsokat érinti: ahitapp:devotional:index (tagok),
 * ahitapp:devotional:data:<dátum>, ahitapp:generation:job:<dátum>.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { getAppTodayIso } from "../src/lib/app-date";
import { planRetention } from "../src/lib/storage/retention";

const INDEX_KEY = "ahitapp:devotional:index";
const DATA_PREFIX = "ahitapp:devotional:data:";
const JOB_PREFIX = "ahitapp:generation:job:";
const CHUNK = 50;

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

function printPlan(plan: ReturnType<typeof planRetention>, total: number, source: string) {
  console.log(`Forrás:            ${source}`);
  console.log(`Mai dátum:         ${plan.referenceDate} (Europe/Bucharest)`);
  console.log(
    `Megőrzés:          ${plan.retentionDays} nap` +
      (plan.cutoff ? ` → legkorábbi megmaradó dátum: ${plan.cutoff}` : " (kikapcsolva)")
  );
  console.log(`Összes áhítat:     ${total}`);
  console.log(`Megmarad:          ${plan.keep.length} (ebből jövőbeli: ${plan.future.length})`);
  console.log(`TÖRLÉSRE JELÖLT:   ${plan.remove.length}`);
  if (plan.remove.length) {
    console.log(`  legrégebbi:      ${plan.remove[0]}`);
    console.log(`  legújabb:        ${plan.remove[plan.remove.length - 1]}`);
    console.log(`  dátumok:         ${plan.remove.join(", ")}`);
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
    }[];
    const dates = raw.map((d) => d.date ?? d.createdAt.slice(0, 10));
    printPlan(planRetention(dates, getAppTodayIso()), dates.length, "data/devotionals.json");
    console.log("\nLokális előnézet — nem töröl semmit.");
    return;
  }

  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    console.error("Redis nincs konfigurálva (KV_REST_API_URL / KV_REST_API_TOKEN). Használd: --env-file=... vagy --source=local");
    process.exit(1);
  }
  const redis = new Redis({ url, token });

  let dates: string[];
  try {
    dates = await redis.zrange<string[]>(INDEX_KEY, 0, -1); // 1 parancs
  } catch (error) {
    console.error("A Redis jelenleg nem fogad parancsokat:", error instanceof Error ? error.message : error);
    console.error("Oldd fel az Upstash korlátot (Console → Database → Usage/Details), majd futtasd újra.");
    process.exit(2);
  }

  const plan = planRetention(dates, getAppTodayIso());
  printPlan(plan, dates.length, "Upstash Redis (index)");

  if (!apply) {
    console.log("\nELŐNÉZET — nem törölt semmit. Törléshez: npm run retention:apply -- --confirm=DELETE-" + plan.remove.length);
    return;
  }

  if (plan.remove.length === 0) {
    console.log("\nNincs törlendő áhítat.");
    return;
  }
  if (arg("confirm") !== `DELETE-${plan.remove.length}`) {
    console.error(`\nMegerősítés hiányzik/eltér. Add meg: --confirm=DELETE-${plan.remove.length}`);
    process.exit(1);
  }

  // Mentés törlés előtt
  const records: unknown[] = [];
  for (let i = 0; i < plan.remove.length; i += CHUNK) {
    const part = plan.remove.slice(i, i + CHUNK);
    records.push(...(await redis.mget<unknown[]>(...part.map((d) => DATA_PREFIX + d))));
  }
  mkdirSync("backups", { recursive: true });
  const backupFile = path.join("backups", `retention-${plan.referenceDate}-${Date.now()}.json`);
  writeFileSync(backupFile, JSON.stringify({ dates: plan.remove, records }, null, 2), "utf-8");
  console.log(`\nMentés kész: ${backupFile}`);

  for (let i = 0; i < plan.remove.length; i += CHUNK) {
    const part = plan.remove.slice(i, i + CHUNK);
    await redis.zrem(INDEX_KEY, ...part);
    await redis.del(...part.map((d) => DATA_PREFIX + d), ...part.map((d) => JOB_PREFIX + d));
  }
  console.log(`Törölve: ${plan.remove.length} áhítat (index + adat + generálási feladat kulcsok).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
