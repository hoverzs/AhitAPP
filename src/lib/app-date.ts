/**
 * Kanonikus naptári dátumok — Europe/Bucharest (Románia / Magyarország, CET/CEST).
 * Ne használj toISOString().slice(0,10) vagy getUTC*() a „ma” meghatározásához.
 */

export const APP_TIMEZONE = "Europe/Bucharest";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dev: logolás a terminálban / böngésző konzolban (NEXT_PUBLIC_DEBUG_APP_DATE=true). */
export const DEBUG_APP_DATE =
  process.env.NEXT_PUBLIC_DEBUG_APP_DATE === "true" ||
  process.env.NODE_ENV === "development";

export interface AppDateParts {
  year: number;
  /** 0 = január */
  monthIndex: number;
  day: number;
  iso: string;
}

export interface CalendarViewMonth {
  year: number;
  monthIndex: number;
}

/** Mai naptári nap YYYY-MM-DD az alkalmazás időzónájában. */
export function getAppTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getAppDateTimeParts(now = new Date()): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

export function parseIsoDateParts(iso: string): AppDateParts | null {
  const m = ISO_DATE_RE.exec(iso.trim());
  if (!m) return null;

  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);

  if (
    !Number.isFinite(year) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return {
    year,
    monthIndex,
    day,
    iso: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

export function getAppTodayParts(now = new Date()): AppDateParts {
  const iso = getAppTodayIso(now);
  const parts = parseIsoDateParts(iso);
  if (!parts) {
    throw new Error(`[app-date] Invalid today ISO: ${iso}`);
  }
  return parts;
}

/** Naptár cella → YYYY-MM-DD (hónap 0-indexelt). */
export function formatCalendarDateIso(
  year: number,
  monthIndex: number,
  day: number
): string {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function isSameCalendarDay(
  year: number,
  monthIndex: number,
  day: number,
  todayIso = getAppTodayIso()
): boolean {
  return formatCalendarDateIso(year, monthIndex, day) === todayIso;
}

/** Alapértelmezett látható hónap: mindig a mai hónap (app TZ), nem a legutóbbi áhítaté. */
export function getDefaultCalendarViewMonth(): CalendarViewMonth {
  const today = getAppTodayParts();
  return { year: today.year, monthIndex: today.monthIndex };
}

export function addCalendarMonths(
  view: CalendarViewMonth,
  delta: number
): CalendarViewMonth {
  let monthIndex = view.monthIndex + delta;
  let year = view.year;

  while (monthIndex < 0) {
    monthIndex += 12;
    year -= 1;
  }
  while (monthIndex > 11) {
    monthIndex -= 12;
    year += 1;
  }

  return { year, monthIndex };
}

/** ISO naptári nap + napok (retention, cutoff). */
export function addDaysToIsoDate(iso: string, days: number): string {
  const p = parseIsoDateParts(iso);
  if (!p) return iso;

  const dt = new Date(p.year, p.monthIndex, p.day);
  dt.setDate(dt.getDate() + days);
  return formatCalendarDateIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function logAppDateDebug(
  context: string,
  extra?: Record<string, unknown>
): void {
  if (!DEBUG_APP_DATE) return;

  const now = new Date();
  const today = getAppTodayParts(now);

  const payload = {
    timezone: APP_TIMEZONE,
    todayIso: today.iso,
    year: today.year,
    monthIndex: today.monthIndex,
    day: today.day,
    /** Csak összehasonlításhoz — NEM használd „ma” meghatározására. */
    utcIsoSlice: now.toISOString().slice(0, 10),
    runtimeIso: typeof process !== "undefined" ? "node" : "browser",
    ...extra,
  };

  if (typeof window !== "undefined") {
    console.info(`[app-date] ${context}`, payload);
  } else {
    console.log(`[app-date] ${context}`, payload);
  }
}
