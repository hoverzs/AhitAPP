import { addDaysToIsoDate, getAppTodayIso } from "./app-date";
import { DEFAULT_RETENTION_DAYS } from "./storage/retention";

/** Hány NAPPAL a mai előtti áhítat marad nyilvános (a mai nap mellett). */
export const PUBLIC_PAST_DAYS = DEFAULT_RETENTION_DAYS;

/** Nyolc nap: a mai és az előző hét nap, a legújabbtól a legrégebbiig. */
export function getPublicWindowDates(today: string = getAppTodayIso()): string[] {
  return Array.from({ length: PUBLIC_PAST_DAYS + 1 }, (_, i) =>
    addDaysToIsoDate(today, -i)
  );
}

export function isDateInPublicWindow(
  date: string,
  today: string = getAppTodayIso()
): boolean {
  return getPublicWindowDates(today).includes(date);
}

/** Az utolsó nap, amikor az adott dátumú áhítat még olvasható. */
export function getDevotionalExpiryDate(date: string): string {
  return addDaysToIsoDate(date, PUBLIC_PAST_DAYS);
}
