import type { Devotional, DevotionalStatus } from "./types";

export const DEVOTIONAL_STATUSES: DevotionalStatus[] = [
  "draft",
  "needs_review",
  "approved",
  "published",
];

export function isDevotionalStatus(value: string): value is DevotionalStatus {
  return DEVOTIONAL_STATUSES.includes(value as DevotionalStatus);
}

/** Régi rekordok (status nélkül) → published */
export function normalizeDevotionalStatus(
  status: DevotionalStatus | undefined
): DevotionalStatus {
  return status ?? "published";
}

export function isApprovedOrPublished(status: DevotionalStatus): boolean {
  return status === "approved" || status === "published";
}

export function isPendingReview(status: DevotionalStatus): boolean {
  return status === "draft" || status === "needs_review";
}

export function statusLabelHu(status: DevotionalStatus): string {
  switch (status) {
    case "draft":
      return "Piszkozat";
    case "needs_review":
      return "Ellenőrzésre vár";
    case "approved":
      return "Jóváhagyva";
    case "published":
      return "Közzétéve";
    default:
      return status;
  }
}

export function normalizeDevotional(entry: Devotional): Devotional & {
  status: DevotionalStatus;
  date: string;
} {
  const status = normalizeDevotionalStatus(entry.status);
  const createdAt = entry.createdAt;
  return {
    ...entry,
    status,
    date: entry.date ?? createdAt.slice(0, 10),
    generatedAt: entry.generatedAt ?? createdAt,
    updatedAt: entry.updatedAt ?? createdAt,
  };
}

/** Nyilvános oldal: csak közzétett. */
export function isPublicDevotional(entry: Devotional): boolean {
  return normalizeDevotionalStatus(entry.status) === "published";
}

export function filterPublicDevotionals(devotionals: Devotional[]): Devotional[] {
  return devotionals.filter(isPublicDevotional);
}
