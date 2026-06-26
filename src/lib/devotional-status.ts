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

/**
 * Nyilvános oldal: közzétett + van tartalom.
 *
 * Szándékosan UGYANAZ a szabály, mint a naptáré (filterCalendarDevotionals),
 * hogy ne fordulhasson elő, hogy a naptárban kattintható egy nap, de a
 * /devotional/[date] oldal 404-et ad. A félbeszakadt szöveg kiszűrése a
 * generálási kapunál történik (ott needs_review lesz a státusz), nem itt
 * a megjelenítéskor.
 */
export function isPublicDevotional(entry: Devotional): boolean {
  if (normalizeDevotionalStatus(entry.status) !== "published") {
    return false;
  }
  return Boolean(entry.content?.trim());
}

export function filterPublicDevotionals(devotionals: Devotional[]): Devotional[] {
  return devotionals.filter(isPublicDevotional);
}

/** Naptár: közzétett + van tartalom (nem kell teljes szöveg-validáció). */
export function filterCalendarDevotionals(devotionals: Devotional[]): Devotional[] {
  return devotionals
    .map(normalizeDevotional)
    .filter(
      (d) =>
        normalizeDevotionalStatus(d.status) === "published" &&
        Boolean(d.content?.trim())
    );
}
