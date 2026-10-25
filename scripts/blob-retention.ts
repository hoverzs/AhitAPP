/**
 * Régi (7 napnál régebbi) KÖZZÉTETT áhítatok előnézete / törlése a Vercel Blob
 * tárolóban — az áhítat DÁTUMA alapján (Europe/Bucharest nap). Piszkozat,
 * jóváhagyott, jövőbeli és a legfrissebb rekord soha nem törlődik. Ugyanazt a
 * logikát használja, mint a napi cron (/api/cron/prune-devotionals).
 *
 *   npx tsx scripts/blob-retention.ts                       # előnézet, SEMMIT nem töröl
 *   npx tsx scripts/blob-retention.ts --env-file=.env.production.local
 *   npx tsx scripts/blob-retention.ts --apply --confirm=DELETE-<darabszám>
 *
 * Hitelesítés: BLOB_DATA_STORE_ID / BLOB_STORE_ID (OIDC, vercel env pull) vagy
 * BLOB_READ_WRITE_TOKEN; a képek törléséhez BLOB_IMAGES_STORE_ID vagy
 * BLOB_IMAGES_READ_WRITE_TOKEN is kell.
 *
 * Törlés előtt JSON mentés készül a backups/ mappába (rekordok + képek URL-jei).
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { createBlobStorage } from "../src/lib/storage/blob/blob-storage";
import {
  BLOB_ACCESS,
  getDataBlobAuth,
  getImagesBlobAuth,
  isBlobStorageConfigured,
  isImageBlobConfigured,
} from "../src/lib/storage/blob/config";
import { isOwnedBlobImageUrl } from "../src/lib/storage/blob/image-store";
import { createVercelBlobClient } from "../src/lib/storage/blob/vercel-client";
import { createVercelImageStore } from "../src/lib/storage/blob/vercel-image-store";

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

async function main() {
  loadEnv();
  const apply = flag("apply");

  if (!isBlobStorageConfigured()) {
    console.error(
      "A Blob adat store nincs konfigurálva (BLOB_DATA_STORE_ID / BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN). Használd: --env-file=..."
    );
    process.exit(1);
  }

  const images = isImageBlobConfigured() ? createVercelImageStore(getImagesBlobAuth()) : null;
  const storage = createBlobStorage(
    createVercelBlobClient({ access: BLOB_ACCESS.data, ...getDataBlobAuth() }),
    { images }
  );

  let preview;
  try {
    preview = await storage.runRetention({ apply: false });
  } catch (error) {
    console.error("A Blob jelenleg nem érhető el:", error instanceof Error ? error.message : error);
    process.exit(2);
  }

  console.log(`Mai dátum:            ${preview.referenceDate} (Europe/Bucharest)`);
  console.log(
    `Megőrzés:             ${preview.retentionDays} nap` +
      (preview.cutoff ? ` → legkorábbi megmaradó dátum: ${preview.cutoff}` : " (kikapcsolva)")
  );
  console.log(`TÖRLÉSRE JELÖLT:      ${preview.removable.length}  (régi + közzétett)`);
  if (preview.removable.length) console.log(`  dátumok:            ${preview.removable.join(", ")}`);
  console.log(`Régi, de MEGMARAD (nem közzétett): ${preview.keptUnpublished.length}`);
  if (preview.keptUnpublished.length) console.log(`  dátumok:            ${preview.keptUnpublished.join(", ")}`);

  if (!apply) {
    console.log(
      `\nELŐNÉZET — nem törölt semmit. Törléshez: npx tsx scripts/blob-retention.ts --apply --confirm=DELETE-${preview.removable.length}`
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

  // Mentés törlés előtt: a teljes rekordok és a képek URL-jei.
  const records = await storage.getDevotionalsByDates(preview.removable);
  const imageUrls = records.map((r) => r.imageUrl).filter((u) => isOwnedBlobImageUrl(u));
  if (imageUrls.length > 0 && !images) {
    console.error("Van törlendő saját kép, de a képtár nincs konfigurálva (BLOB_IMAGES_*) — a képek árván maradnának.");
  }
  mkdirSync("backups", { recursive: true });
  const backupFile = path.join("backups", `blob-retention-${preview.referenceDate}-${Date.now()}.json`);
  writeFileSync(backupFile, JSON.stringify({ dates: preview.removable, imageUrls, records }, null, 2), "utf-8");
  console.log(`\nMentés kész: ${backupFile}`);

  const done = await storage.runRetention({ apply: true });
  console.log(
    `Törölve: ${done.deleted ? done.removable.length : 0} áhítat, képek: ${done.imagesDeleted} törölve` +
      (done.imagesFailed.length ? `, ${done.imagesFailed.length} sikertelen` : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
