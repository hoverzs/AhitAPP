import { APP_TIMEZONE, getAppDateTimeParts, getAppTodayIso } from "./app-date";
import type { DailyGenerationJob } from "./generation-job-types";

/** Gyors retry késleltetések (ms): 1 perc, 3 perc, 5 perc. */
export const FAST_RETRY_DELAYS_MS = [60_000, 180_000, 300_000] as const;

/** Ütemezett retry időpontok — perc éjféltől (Europe/Bucharest). */
export const SCHEDULED_RETRY_MINUTES = [30, 60, 120, 240, 360] as const;

const LOG_PREFIX = "[generation-job-schedule]";

/** Helyi (app TZ) dátum+idő → UTC Date (DST-biztos keresés). */
export function appLocalDateTimeToUtc(
  dateIso: string,
  hour: number,
  minute: number,
  second = 0
): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const target = { year: y, month: m, day: d, hour, minute, second };

  function localPartsMatch(timeMs: number): boolean {
    const parts = formatter.formatToParts(new Date(timeMs));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? -1);
    return (
      get("year") === target.year &&
      get("month") === target.month &&
      get("day") === target.day &&
      get("hour") === target.hour &&
      get("minute") === target.minute &&
      get("second") === target.second
    );
  }

  const start = Date.UTC(y, m - 1, d, 0, 0, 0) - 4 * 3_600_000;
  const end = Date.UTC(y, m - 1, d, 23, 59, 59) + 4 * 3_600_000;

  for (let t = start; t <= end; t += 1_000) {
    if (localPartsMatch(t)) {
      return new Date(t);
    }
  }

  console.warn(
    `${LOG_PREFIX} DST fallback for ${dateIso} ${hour}:${minute}`
  );
  return new Date(Date.UTC(y, m - 1, d, hour - 2, minute, second));
}

function minutesSinceMidnight(now: Date): number {
  const { hour, minute } = getAppDateTimeParts(now);
  return hour * 60 + minute;
}

/**
 * Következő retry időpont — null = nincs több próba (FAILED).
 * A job mezőit (fast_retry_index, scheduled_retry_index, phase) frissíti.
 */
export function scheduleNextRetry(
  job: DailyGenerationJob,
  now = new Date()
): Date | null {
  if (getAppTodayIso(now) !== job.date) {
    return null;
  }

  if (job.fast_retry_index < FAST_RETRY_DELAYS_MS.length) {
    const delay = FAST_RETRY_DELAYS_MS[job.fast_retry_index];
    job.fast_retry_index += 1;
    job.phase = "fast";
    return new Date(now.getTime() + delay);
  }

  job.phase = "scheduled";
  const nowMin = minutesSinceMidnight(now);

  while (job.scheduled_retry_index < SCHEDULED_RETRY_MINUTES.length) {
    const slotMin = SCHEDULED_RETRY_MINUTES[job.scheduled_retry_index];
    job.scheduled_retry_index += 1;

    if (slotMin > nowMin) {
      const hour = Math.floor(slotMin / 60);
      const minute = slotMin % 60;
      return appLocalDateTimeToUtc(job.date, hour, minute);
    }
  }

  return null;
}

export function formatScheduledSlotLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
