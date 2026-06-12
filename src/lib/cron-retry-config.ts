import { getSiteUrl } from "./site-url";

export const PROCESS_GENERATION_RETRIES_PATH =
  "/api/cron/process-generation-retries";

/** Külső cron (cron-job.org stb.) által hívandó retry endpoint — teljes URL. */
export function getExternalRetryCronUrl(): string {
  return `${getSiteUrl()}${PROCESS_GENERATION_RETRIES_PATH}`;
}

/** Javasolt külső ütemezés — Europe/Bucharest, az éjféli generálás után. */
export const EXTERNAL_RETRY_SCHEDULE_LABEL =
  "01:05, 02:05, 03:05 (Europe/Bucharest)";

export const EXTERNAL_RETRY_CRON_HELP =
  "Vercel Hobby csomagon az óránkénti retryhez külső ütemező szükséges.";
