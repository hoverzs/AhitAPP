import { devotionalDateKey } from "./storage/devotional-validate";
import { getBudapestDateIso } from "./timezone";
import type { Devotional } from "./types";

/** Naptár cella → YYYY-MM-DD (hónap 0-indexelt). */
export function formatCalendarDateIso(
  year: number,
  month: number,
  day: number
): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Published áhítatok dátum szerint (YYYY-MM-DD → rekord). */
export function buildPublishedDevotionalDateMap(
  devotionals: Devotional[]
): Map<string, Devotional> {
  const map = new Map<string, Devotional>();
  for (const d of devotionals) {
    const key = devotionalDateKey(d);
    if (key) {
      map.set(key, d);
    }
  }
  return map;
}

export function hasDevotional(
  dateIso: string,
  byDate: Map<string, Devotional>
): boolean {
  return byDate.has(dateIso);
}

export function getDevotionalByCalendarDate(
  year: number,
  month: number,
  day: number,
  byDate: Map<string, Devotional>
): Devotional | undefined {
  return byDate.get(formatCalendarDateIso(year, month, day));
}

/** Publikus áhítat URL — dátum alapú route. */
export function getDevotionalRoute(devotional: Devotional): string {
  return getDevotionalHref(devotionalDateKey(devotional));
}

export function getDevotionalHref(dateIso: string): string {
  return `/devotional/${dateIso}`;
}

export function getTodayDateIso(): string {
  return getBudapestDateIso();
}

export function isCalendarToday(
  year: number,
  month: number,
  day: number,
  todayIso = getTodayDateIso()
): boolean {
  return formatCalendarDateIso(year, month, day) === todayIso;
}

/** Naptár kezdő hónap — legutóbbi közzétett áhítat dátuma, vagy ma. */
export function getSuggestedCalendarViewDate(
  devotionals: Devotional[]
): Date {
  if (devotionals.length === 0) return new Date();

  const sorted = [...devotionals].sort((a, b) =>
    devotionalDateKey(b).localeCompare(devotionalDateKey(a))
  );
  const latestKey = devotionalDateKey(sorted[0]);
  const parsed = new Date(`${latestKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
