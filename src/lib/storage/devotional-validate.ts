import { isDevotionalStatus, normalizeDevotional } from "../devotional-status";
import type { Devotional } from "../types";

export function devotionalDateKey(devotional: Devotional): string {
  return devotional.date ?? devotional.createdAt.slice(0, 10);
}

export function isValidDevotional(entry: unknown): entry is Devotional {
  if (!entry || typeof entry !== "object") return false;
  const d = entry as Devotional;
  const hasDate = d.date === undefined || typeof d.date === "string";
  const hasStatus =
    d.status === undefined ||
    (typeof d.status === "string" && isDevotionalStatus(d.status));

  return (
    typeof d.dayNumber === "number" &&
    d.dayNumber >= 1 &&
    typeof d.title === "string" &&
    typeof d.verse === "string" &&
    typeof d.content === "string" &&
    typeof d.imageUrl === "string" &&
    typeof d.createdAt === "string" &&
    hasDate &&
    hasStatus &&
    (d.category === undefined || typeof d.category === "string") &&
    (d.facebookCopy === undefined || typeof d.facebookCopy === "string") &&
    (d.prayer === undefined || typeof d.prayer === "string") &&
    (d.reflectionQuestion === undefined || typeof d.reflectionQuestion === "string") &&
    (d.promptVersion === undefined || typeof d.promptVersion === "string") &&
    (d.generationModel === undefined || typeof d.generationModel === "string") &&
    (d.editedByAdmin === undefined || typeof d.editedByAdmin === "boolean") &&
    (d.imageKeywords === undefined || typeof d.imageKeywords === "string") &&
    (d.imageSource === undefined ||
      d.imageSource === "pexels_auto" ||
      d.imageSource === "pexels" ||
      d.imageSource === "imagen" ||
      d.imageSource === "manual") &&
    (d.imageCredit === undefined || typeof d.imageCredit === "string") &&
    (d.imagePhotographerUrl === undefined || typeof d.imagePhotographerUrl === "string") &&
    (d.pexelsPhotoId === undefined || typeof d.pexelsPhotoId === "number")
  );
}

export function parseDevotionalList(raw: unknown): Devotional[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidDevotional).map(normalizeDevotional);
}

export function sortDevotionals(devotionals: Devotional[]): Devotional[] {
  return [...devotionals].sort((a, b) => a.dayNumber - b.dayNumber);
}
