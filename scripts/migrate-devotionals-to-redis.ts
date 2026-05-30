/**
 * Lokális data/devotionals.json → Upstash Redis migráció.
 * Futtatás (Redis env beállítva):
 *   STORAGE_DRIVER=redis npx tsx scripts/migrate-devotionals-to-redis.ts
 */
import { localJsonStorage } from "../src/lib/storage/local-json-storage";
import {
  getRedisRestCredentials,
  migrateLocalJsonToRedis,
  getRetentionDays,
} from "../src/lib/storage";

async function main() {
  const creds = getRedisRestCredentials();
  if (!creds) {
    console.error(
      "Redis nincs konfigurálva. Állítsd be KV_REST_API_URL + KV_REST_API_TOKEN (vagy UPSTASH_REDIS_REST_*)."
    );
    process.exit(1);
  }

  const local = await localJsonStorage.getLatestDevotionals();
  console.log(`Lokális rekordok: ${local.length}`);
  console.log(`Retention: ${getRetentionDays()} nap (DEVOTIONAL_RETENTION_DAYS)`);

  const count = await migrateLocalJsonToRedis();
  console.log(`Redis-be feltöltve: ${count} áhítat.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
