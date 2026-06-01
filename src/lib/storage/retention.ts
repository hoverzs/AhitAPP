import { addDaysToIsoDate, getAppTodayIso } from "../app-date";

const DEFAULT_RETENTION_DAYS = 90;

/** 0 = retention kikapcsolva (minden megmarad). Alapértelmezés: 90 nap. */
export function getRetentionDays(): number {
  const raw = process.env.DEVOTIONAL_RETENTION_DAYS?.trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETENTION_DAYS;
  return parsed;
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

export function isDateWithinRetention(
  date: string,
  referenceDate: string = getAppTodayIso()
): boolean {
  const cutoff = getRetentionCutoffDate(referenceDate);
  if (!cutoff) return true;
  return date >= cutoff;
}
