import type { ProcessDueRetriesResult } from "./generation-job-runner";
import { generationJobStatusLabel } from "./generation-job-labels";
import type { DailyGenerationJob } from "./generation-job-types";

export interface RetryProcessorJsonResponse {
  ok: boolean;
  processed: boolean;
  status: string | null;
  message: string;
  nextRetryAt: string | null;
  retryCount: number;
  autoRetryCount?: number;
  code?: string;
  dayNumber?: number;
}

function jobFields(job: DailyGenerationJob | null | undefined): Pick<
  RetryProcessorJsonResponse,
  "status" | "nextRetryAt" | "retryCount" | "autoRetryCount"
> {
  return {
    status: job?.status ?? null,
    nextRetryAt: job?.next_retry_at ?? null,
    retryCount: job?.retry_count ?? 0,
    autoRetryCount: job?.auto_retry_count,
  };
}

export function buildRetryProcessorResponse(
  result: ProcessDueRetriesResult
): RetryProcessorJsonResponse {
  if ("processed" in result) {
    return {
      ok: true,
      processed: false,
      status: null,
      message: result.reason || "No due retry job",
      nextRetryAt: null,
      retryCount: 0,
    };
  }

  const fields = jobFields(result.job);

  if (result.success && result.devotional) {
    return {
      ok: true,
      processed: true,
      status: result.job.status,
      message: result.skipped
        ? `Már publikálva: ${result.devotional.dayNumber}. nap`
        : `Sikeres generálás: ${result.devotional.dayNumber}. nap — „${result.devotional.title}”`,
      nextRetryAt: null,
      retryCount: result.job.retry_count,
      autoRetryCount: result.job.auto_retry_count,
      dayNumber: result.devotional.dayNumber,
    };
  }

  if (result.success && result.skipped) {
    return {
      ok: true,
      processed: true,
      status: result.job.status,
      message: "Már van publikált áhítat — duplikáció elkerülve.",
      nextRetryAt: null,
      retryCount: result.job.retry_count,
      autoRetryCount: result.job.auto_retry_count,
    };
  }

  const statusLabel = fields.status
    ? generationJobStatusLabel(fields.status as DailyGenerationJob["status"])
    : "unknown";

  return {
    ok: result.job.status !== "failed",
    processed: true,
    status: result.job.status,
    message:
      result.error ??
      result.job.last_error ??
      `Retry feldolgozva — ${statusLabel}`,
    nextRetryAt: fields.nextRetryAt,
    retryCount: fields.retryCount,
    autoRetryCount: fields.autoRetryCount,
    code: result.code,
  };
}
