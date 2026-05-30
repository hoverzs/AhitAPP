export const APP_TIMEZONE = "Europe/Budapest";

/** Mai naptári nap YYYY-MM-DD — Europe/Budapest (cron, generálás). */
export function getBudapestDateIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getBudapestDateTimeParts(now = new Date()): {
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

/** Vercel cron ablak: 00:00–00:29 Budapest (DST-biztos dupla UTC trigger mellett). */
export function isWithinBudapestMidnightCronWindow(now = new Date()): boolean {
  const { hour, minute } = getBudapestDateTimeParts(now);
  return hour === 0 && minute < 30;
}
