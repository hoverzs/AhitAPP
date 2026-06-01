import { devotionalDateKey } from "./storage/devotional-validate";
import {
  addCalendarMonths,
  formatCalendarDateIso,
  getAppTodayIso,
  getAppTodayParts,
  getDefaultCalendarViewMonth,
  isSameCalendarDay,
  logAppDateDebug,
  type CalendarViewMonth,
} from "./app-date";
import type { Devotional } from "./types";

export type { CalendarViewMonth };

export {
  formatCalendarDateIso,
  getDefaultCalendarViewMonth,
  addCalendarMonths,
};

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
  monthIndex: number,
  day: number,
  byDate: Map<string, Devotional>
): Devotional | undefined {
  return byDate.get(formatCalendarDateIso(year, monthIndex, day));
}

/** Publikus áhítat URL — dátum alapú route. */
export function getDevotionalRoute(devotional: Devotional): string {
  return getDevotionalHref(devotionalDateKey(devotional));
}

export function getDevotionalHref(dateIso: string): string {
  return `/devotional/${dateIso}`;
}

/** Mai nap YYYY-MM-DD — Europe/Bucharest. */
export function getTodayDateIso(): string {
  return getAppTodayIso();
}

export function isCalendarToday(
  year: number,
  monthIndex: number,
  day: number,
  todayIso = getTodayDateIso()
): boolean {
  return isSameCalendarDay(year, monthIndex, day, todayIso);
}

/**
 * @deprecated Használd getDefaultCalendarViewMonth() — nem Date-et ad vissza.
 */
export function getSuggestedCalendarViewDate(): Date {
  const { year, monthIndex } = getDefaultCalendarViewMonth();
  return new Date(year, monthIndex, 1);
}

/** Kliens naptár init + debug. */
export function initCalendarDateContext(
  component: string,
  viewMonth: CalendarViewMonth
): CalendarViewMonth {
  const today = getAppTodayParts();
  logAppDateDebug(`${component}:init`, {
    viewYear: viewMonth.year,
    viewMonthIndex: viewMonth.monthIndex,
    todayIso: today.iso,
  });
  return viewMonth;
}
