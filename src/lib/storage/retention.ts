import { addDaysToIsoDate, getAppTodayIso } from "../app-date";

/** A mai nap + az előző 7 nap marad meg (összesen 8 nap). */
export const DEFAULT_RETENTION_DAYS = 7;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hány napnyi áhítat maradjon meg (az áhítat DÁTUMA alapján).
 * Alapértelmezés: 7 (mai nap + előző 7 nap). DEVOTIONAL_RETENTION_DAYS=0 → nincs korlát.
 */
export function getRetentionDays(): number {
  const raw = process.env.DEVOTIONAL_RETENTION_DAYS?.trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

/**
 * Az automatikus törlés csak kifejezett engedélyezéssel fut
 * (DEVOTIONAL_RETENTION_AUTO_DELETE=true). Enélkül a napi cron csak előnézetet
 * ad (és npm run retention:preview), éles adat nem törlődik.
 */
export function isRetentionAutoDeleteEnabled(): boolean {
  return process.env.DEVOTIONAL_RETENTION_AUTO_DELETE?.trim().toLowerCase() === "true";
}

/** @deprecated Használd parseIsoDateParts (app-date). */
export function parseDateIso(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysToDateIso(date: string, days: number): string {
  return addDaysToIsoDate(date, days);
}

/** Legkorábbi megőrzött dátum (YYYY-MM-DD), vagy null ha nincs limit. */
export function getRetentionCutoffDate(
  referenceDate: string = getAppTodayIso()
): string | null {
  const days = getRetentionDays();
  if (days <= 0) return null;
  return addDaysToDateIso(referenceDate, -days);
}

/**
 * Megmarad-e a dátum? A cutoff-nál újabb VAGY jövőbeli dátum megmarad
 * (előre elkészített áhítatok). Nem YYYY-MM-DD formátumú kulcsot soha
 * nem tekintünk törlendőnek.
 */
export function isDateWithinRetention(
  date: string,
  referenceDate: string = getAppTodayIso()
): boolean {
  if (!ISO_DATE_RE.test(date)) return true;
  const cutoff = getRetentionCutoffDate(referenceDate);
  if (!cutoff) return true;
  return date >= cutoff;
}

export interface RetentionPlan {
  referenceDate: string;
  retentionDays: number;
  cutoff: string | null;
  keep: string[];
  remove: string[];
  future: string[];
}

/** Tiszta függvény: mely dátumok törlendők / maradnak. Semmit nem töröl. */
export function planRetention(
  dates: string[],
  referenceDate: string = getAppTodayIso()
): RetentionPlan {
  const retentionDays = getRetentionDays();
  const cutoff = getRetentionCutoffDate(referenceDate);
  const sorted = [...dates].sort();
  // A legfrissebb áhítat mindig megmarad (a napszámozás max(dayNumber)+1 alapú,
  // és hosszú kihagyás után sem üresedhet ki a tároló).
  const newest = [...sorted].reverse().find((d) => ISO_DATE_RE.test(d));
  const remove = sorted.filter(
    (d) => d !== newest && !isDateWithinRetention(d, referenceDate)
  );
  const removeSet = new Set(remove);
  return {
    referenceDate,
    retentionDays,
    cutoff,
    keep: sorted.filter((d) => !removeSet.has(d)),
    remove,
    future: sorted.filter((d) => ISO_DATE_RE.test(d) && d > referenceDate),
  };
}
