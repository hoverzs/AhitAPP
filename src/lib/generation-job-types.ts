/** Napi automatikus generálás állapota — Redis / JSON fájlban perzisztálva. */
export type GenerationJobStatus =
  | "running"
  | "pending_retry"
  | "published"
  | "failed";

export type GenerationJobPhase = "fast" | "scheduled";

export interface GenerationAttemptLogEntry {
  at: string;
  attemptNumber: number;
  phase: "initial" | GenerationJobPhase;
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
}

export interface DailyGenerationJob {
  date: string;
  status: GenerationJobStatus;
  retry_count: number;
  /** Hány gyors (1/3/5 perc) késleltetés lett már ütemezve. */
  fast_retry_index: number;
  /** Következő ütemezett slot indexe a SCHEDULED_RETRY_MINUTES tömbben. */
  scheduled_retry_index: number;
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
  };
}

export function createEmptyGenerationJob(date: string): DailyGenerationJob {
  const now = new Date().toISOString();
  return {
    date,
    status: "running",
    retry_count: 0,
    fast_retry_index: 0,
    scheduled_retry_index: 0,
    phase: "fast",
    last_error: null,
    last_error_code: null,
    last_attempt_at: null,
    next_retry_at: null,
    created_at: now,
    published_at: null,
    logs: [],
  };
}
