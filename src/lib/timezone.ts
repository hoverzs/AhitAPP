/**
 * @deprecated Importálj közvetlenül `@/lib/app-date`-ből.
 * Cron és régi importok kompatibilitása.
 */
export {
  APP_TIMEZONE,
  getAppTodayIso as getBudapestDateIso,
  getAppDateTimeParts as getBudapestDateTimeParts,
} from "./app-date";

import { getAppDateTimeParts } from "./app-date";

/** Vercel cron ablak: 00:00–00:29 app időzóna (DST-biztos). */
export function isWithinBudapestMidnightCronWindow(now = new Date()): boolean {
  const { hour, minute } = getAppDateTimeParts(now);
  return hour === 0 && minute < 30;
}
