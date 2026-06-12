/** Napi automatikus generálás állapota — Redis / JSON fájlban perzisztálva. */
export type GenerationJobStatus =
  | "running"
  | "pending_retry"
  | "published"
  | "failed";

export type GenerationJobPhase = "initial" | "hourly";

export interface GenerationAttemptLogEntry {
  at: string;
  attemptNumber: number;
  phase: GenerationJobPhase;
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
}

export interface DailyGenerationJob {
  date: string;
  status: GenerationJobStatus;
  /** Összes generálási kísérlet (első + retry-k). */
  retry_count: number;
  /** Az első sikertelen generálás időpontja — óránkénti retry horgony. */
  first_failed_at: string | null;
  /** Ütemezett óránkénti retry-k száma az első hiba után (max. 3). */
  auto_retry_count: number;
  phase: GenerationJobPhase;
  last_error: string | null;
  last_error_code: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  published_at: string | null;
  logs: GenerationAttemptLogEntry[];
}

export interface AdminDailyGenerationJobSummary {
  date: string;
  status: GenerationJobStatus;
  retry_count: number;
  last_error: string | null;
  last_error_code: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  published_at: string | null;
  phase: GenerationJobPhase;
  auto_retry_count: number;
}

export function toAdminJobSummary(
  job: DailyGenerationJob
): AdminDailyGenerationJobSummary {
  return {
    date: job.date,
    status: job.status,
    retry_count: job.retry_count,
    last_error: job.last_error,
    last_error_code: job.last_error_code,
    last_attempt_at: job.last_attempt_at,
    next_retry_at: job.next_retry_at,
    published_at: job.published_at,
    phase: job.phase,
    auto_retry_count: job.auto_retry_count,
  };
}

export function createEmptyGenerationJob(date: string): DailyGenerationJob {
  const now = new Date().toISOString();
  return {
    date,
    status: "running",
    retry_count: 0,
    first_failed_at: null,
    auto_retry_count: 0,
    phase: "initial",
    last_error: null,
    last_error_code: null,
    last_attempt_at: null,
    next_retry_at: null,
    created_at: now,
    published_at: null,
    logs: [],
  };
}

/** Régi job rekordok (fast/scheduled retry) kompatibilitása. */
export function normalizeGenerationJob(
  raw: DailyGenerationJob & {
    fast_retry_index?: number;
    scheduled_retry_index?: number;
  }
): DailyGenerationJob {
  return {
    ...raw,
    first_failed_at: raw.first_failed_at ?? raw.last_attempt_at ?? null,
    auto_retry_count:
      raw.auto_retry_count ??
      Math.min(
        3,
        (raw.fast_retry_index ?? 0) + (raw.scheduled_retry_index ?? 0)
      ),
    phase: raw.phase === "hourly" ? "hourly" : raw.phase === "initial" ? "initial" : "hourly",
  };
}
