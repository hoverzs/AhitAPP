import type { DailyGenerationJob } from "./generation-job-types";

/** Legfeljebb 3 automatikus óránkénti újrapróba az első sikertelen generálás után. */
export const MAX_AUTO_RETRIES = 3;

const ONE_HOUR_MS = 3_600_000;

/**
 * Következő retry időpont — null = nincs több próba (FAILED).
 * Az első sikertelen generálás időpontjához képest: +1h, +2h, +3h.
 */
export function scheduleNextRetry(
  job: DailyGenerationJob,
  now = new Date()
): Date | null {
  if (!job.first_failed_at) {
    job.first_failed_at = now.toISOString();
  }

  if (job.auto_retry_count >= MAX_AUTO_RETRIES) {
    return null;
  }

  const nextRetryNumber = job.auto_retry_count + 1;
  job.auto_retry_count = nextRetryNumber;
  job.phase = "hourly";

  const anchor = new Date(job.first_failed_at).getTime();
  return new Date(anchor + nextRetryNumber * ONE_HOUR_MS);
}

export function formatHourlyRetryLabel(retryNumber: number): string {
  return `${retryNumber}. óránkénti újrapróba (+${retryNumber} óra)`;
}
