import {
  isPexelsConfigured,
  autoSelectPexelsImageForDevotional,
  photoToAssignment,
  normalizeKeywordsForPexelsSearch,
} from "./pexels";
import { isHeroImageUrl } from "./image-assets";
import type { Devotional, DynamicPlannedDay } from "./types";

export interface ResolvedDevotionalImage {
  imageUrl: string;
  imageSource?: Devotional["imageSource"];
  imageCredit?: string;
  imagePhotographerUrl?: string;
  pexelsPhotoId?: number;
  autoAssigned?: boolean;
}

export interface AutoImageResult extends ResolvedDevotionalImage {
  assigned: boolean;
  searchQuery?: string;
}

/** Ha a Gemini nem ad imageKeywords-t, kategória + cím alapján. */
export function deriveImageKeywordsFromPlan(planned: DynamicPlannedDay): string {
  const categoryHints: Record<string, string> = {
    békesség: "still lake, soft light, calm water",
    hit: "sunrise path, golden horizon, open sky",
    remény: "dawn light, morning mist, new day",
    bizalom: "steady mountain, quiet forest, solid ground",
    hálá: "warm meadow, gentle light, peaceful field",
    imádság: "quiet chapel light, candle glow, serene nature",
    önreflexió: "misty lake, reflection, solitary path",
  };

  const catKey = planned.category.trim().toLowerCase();
  const fromCategory = categoryHints[catKey];
  if (fromCategory) return fromCategory;

  return "peaceful landscape, quiet path, golden hour, contemplative nature";
}

/**
 * Automatikus Pexels kép hozzárendelés generáláskor (háttérben, nem dob hibát).
 * Kézi feltöltés (manual) megmarad regenerate esetén is.
 */
export async function resolveDevotionalImageForGeneration(
  planned: DynamicPlannedDay,
  existing?: Devotional
): Promise<AutoImageResult> {
  if (existing?.imageSource === "manual" && hasValidExistingManualImage(existing)) {
    return {
      imageUrl: existing.imageUrl,
      imageSource: "manual",
      imageCredit: existing.imageCredit,
      imagePhotographerUrl: existing.imagePhotographerUrl,
      pexelsPhotoId: undefined,
      assigned: true,
      autoAssigned: false,
    };
  }

  if (!isPexelsConfigured()) {
    console.warn("[resolveDevotionalImage] Pexels nincs konfigurálva — fallback kép.");
    return { ...emptyDevotionalImage(), assigned: false };
  }

  const imageKeywords =
    planned.imageKeywords?.trim() ||
    existing?.imageKeywords?.trim() ||
    deriveImageKeywordsFromPlan(planned);

  try {
    const result = await autoSelectPexelsImageForDevotional({
      imageKeywords,
      category: planned.category,
    });

    if (result) {
      const assignment = photoToAssignment(result.photo);
      if (isHeroImageUrl(assignment.imageUrl)) {
        return { ...emptyDevotionalImage(), assigned: false };
      }
      return {
        imageUrl: assignment.imageUrl,
        imageSource: "pexels_auto",
        imageCredit: assignment.imageCredit,
        imagePhotographerUrl: assignment.imagePhotographerUrl,
        pexelsPhotoId: assignment.pexelsPhotoId,
        assigned: true,
        autoAssigned: true,
        searchQuery: result.searchQuery,
      };
    }
  } catch (error) {
    console.warn("[resolveDevotionalImage] Automatikus kép hiba (fallback):", error);
  }

  return { ...emptyDevotionalImage(), assigned: false };
}

/** Admin: meglévő áhítathoz automatikus kép (manuális felülírás nélkül). */
export async function autoAssignPexelsToDevotional(devotional: Devotional): Promise<AutoImageResult> {
  const keywords =
    devotional.imageKeywords?.trim() || deriveImageKeywordsFromPlan({
      dayNumber: devotional.dayNumber,
      title: devotional.title,
      verse: devotional.verse,
      content: devotional.content,
      category: devotional.category ?? "",
      imageKeywords: devotional.imageKeywords,
    });

  return resolveDevotionalImageForGeneration(
    {
      dayNumber: devotional.dayNumber,
      title: devotional.title,
      verse: devotional.verse,
      content: devotional.content,
      category: devotional.category ?? "",
      imageKeywords: keywords,
    },
    devotional.imageSource === "manual" ? devotional : undefined
  );
}

function hasValidExistingManualImage(existing: Devotional): boolean {
  const url = existing.imageUrl?.trim();
  return Boolean(url && !isHeroImageUrl(url));
}

function emptyDevotionalImage(): ResolvedDevotionalImage {
  return {
    imageUrl: "",
    imageSource: undefined,
    imageCredit: undefined,
    imagePhotographerUrl: undefined,
    pexelsPhotoId: undefined,
    autoAssigned: false,
  };
}

export { normalizeKeywordsForPexelsSearch };
