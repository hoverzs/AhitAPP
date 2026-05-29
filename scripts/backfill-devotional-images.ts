/**
 * Meglévő áhítatokhoz automatikus Pexels kép hozzárendelés (imageUrl üres).
 * Futtatás: npx tsx scripts/backfill-devotional-images.ts
 */
import { readDevotionals, saveDevotionalPexelsImage } from "../src/lib/devotionals";
import { autoAssignPexelsToDevotional } from "../src/lib/devotional-image";
import { hasAssignedDevotionalImage } from "../src/lib/image-assets";

async function main() {
  const all = await readDevotionals();
  let updated = 0;

  for (const d of all) {
    if (hasAssignedDevotionalImage(d.imageUrl) || d.imageSource === "manual") {
      continue;
    }

    console.log(`Keresés: ${d.dayNumber}. nap — ${d.title}`);
    const result = await autoAssignPexelsToDevotional(d);

    if (!result.assigned || !result.imageUrl) {
      console.log(`  → nincs Pexels találat, fallback marad`);
      continue;
    }

    await saveDevotionalPexelsImage(
      d.dayNumber,
      {
        imageUrl: result.imageUrl,
        imageCredit: result.imageCredit!,
        imagePhotographerUrl: result.imagePhotographerUrl!,
        pexelsPhotoId: result.pexelsPhotoId,
      },
      { source: "pexels_auto" }
    );

    console.log(`  → kép hozzárendelve (${result.pexelsPhotoId})`);
    updated++;
  }

  console.log(`Kész. Frissítve: ${updated} áhítat.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
