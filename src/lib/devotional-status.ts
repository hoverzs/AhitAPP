import { getAppTodayIso } from "./app-date";
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
 * Nyilvánosságra szánt-e a státusz (a dátumtól függetlenül): a `published`
 * mindig; a `approved` csak heti sorozat (weekId) áhítatánál — az ütemezett
 * áhítat. Régi, heti azonosító nélküli `approved` rekord nem nyilvános.
 */
export function isPublicStatus(
  status: DevotionalStatus | undefined,
  weekId?: string
): boolean {
  const normalized = normalizeDevotionalStatus(status);
  if (normalized === "published") return true;
  return normalized === "approved" && Boolean(weekId?.trim());
}

/**
 * Nyilvános oldal: nyilvánosságra szánt státusz + van tartalom + a nap már
 * elérkezett (dátum ≤ ma). A jövőbeli napú áhítat SOHA nem nyilvános, bármilyen
 * státuszú is — ez az egyetlen kapu a listák, az API, az egyedi URL és az
 * Open Graph metaadatok előtt.
 *
 * Szándékosan UGYANAZ a szabály, mint a naptáré (filterCalendarDevotionals),
 * hogy ne fordulhasson elő, hogy a naptárban kattintható egy nap, de a
 * /devotional/[date] oldal 404-et ad. A félbeszakadt szöveg kiszűrése a
 * generálási kapunál történik (ott needs_review lesz a státusz), nem itt
 * a megjelenítéskor.
 */
export function isPublicDevotional(
  entry: Devotional,
  today: string = getAppTodayIso()
): boolean {
  if (!isPublicStatus(entry.status, entry.weekId)) return false;
  if (!entry.content?.trim()) return false;
  const date = entry.date ?? entry.createdAt.slice(0, 10);
  return date <= today;
}

export function filterPublicDevotionals(
  devotionals: Devotional[],
  today: string = getAppTodayIso()
): Devotional[] {
  return devotionals.filter((d) => isPublicDevotional(d, today));
}

/** Naptár: közzétett + van tartalom (nem kell teljes szöveg-validáció). */
export function filterCalendarDevotionals(
  devotionals: Devotional[],
  today: string = getAppTodayIso()
): Devotional[] {
  return devotionals
    .map(normalizeDevotional)
    .filter((d) => isPublicDevotional(d, today));
}
