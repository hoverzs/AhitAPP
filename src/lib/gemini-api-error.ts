import type { GenerateContentResponse } from "./gemini-response";

/** HTTP / hálózati Gemini hiba kategória — naplózás és felhasználói üzenethez. */
export type GeminiApiFailureKind =
  | "AUTH"
  | "QUOTA"
  | "OVERLOAD"
  | "NETWORK"
  | "TIMEOUT"
  | "TLS"
  | "HTTP"
  | "JSON_BODY"
  | "UNKNOWN";

const RAW_BODY_LOG_LIMIT = 16_000;

export interface ParsedGeminiHttpError {
  httpStatus: number;
  geminiMessage: string;
  geminiStatus?: string;
  geminiCode?: number;
  rawBody: string;
}

export interface GeminiApiFailureLog {
  context: string;
  model: string;
  httpStatus?: number;
  geminiMessage?: string;
  geminiStatus?: string;
  durationMs: number;
  /** Belső generateContent próba (token/JSON retry). */
  attempt: number;
  /** Overload retry sorszáma (0 = első hívás). */
  overloadRetry?: number;
  kind: GeminiApiFailureKind;
  willRetry: boolean;
  retryReason?: string;
  rawBody?: string;
  errorName?: string;
  causeMessage?: string;
}

/**
 * Részletes Gemini hiba a fetch rétegben — a valódi HTTP státusz és API üzenet megmarad.
 */
export class GeminiApiError extends Error {
  readonly kind: GeminiApiFailureKind;
  readonly httpStatus?: number;
  readonly geminiMessage?: string;
  readonly geminiStatus?: string;
  readonly model: string;
  readonly logContext: string;
  readonly attempt: number;
  readonly overloadRetry?: number;
  readonly durationMs: number;
  readonly rawBody?: string;

  constructor(params: {
    kind: GeminiApiFailureKind;
    message: string;
    model: string;
    logContext: string;
    attempt: number;
    durationMs: number;
    httpStatus?: number;
    geminiMessage?: string;
    geminiStatus?: string;
    rawBody?: string;
    overloadRetry?: number;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "GeminiApiError";
    this.kind = params.kind;
    this.httpStatus = params.httpStatus;
    this.geminiMessage = params.geminiMessage;
    this.geminiStatus = params.geminiStatus;
    this.model = params.model;
    this.logContext = params.logContext;
    this.attempt = params.attempt;
    this.overloadRetry = params.overloadRetry;
    this.durationMs = params.durationMs;
    this.rawBody = params.rawBody;
    if (params.cause !== undefined) {
      this.cause = params.cause;
    }
  }
}

export function isGeminiApiError(error: unknown): error is GeminiApiError {
  return error instanceof GeminiApiError;
}

/** Dev: részletes hiba a admin UI-ban (GEMINI_DEBUG_UI=false kikapcsolja). */
export function isGeminiDebugUiEnabled(): boolean {
  const explicit =
    process.env.GEMINI_DEBUG_UI?.trim() ||
    process.env.NEXT_PUBLIC_GEMINI_DEBUG_UI?.trim();

  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.NODE_ENV === "development";
}

export function classifyGeminiHttpStatus(httpStatus: number): GeminiApiFailureKind {
  if (httpStatus === 401 || httpStatus === 403) return "AUTH";
  if (httpStatus === 429) return "QUOTA";
  if (httpStatus === 503 || httpStatus === 502 || httpStatus === 504) return "OVERLOAD";
  if (httpStatus >= 500) return "OVERLOAD";
  if (httpStatus >= 400) return "HTTP";
  return "UNKNOWN";
}

export function classifyNetworkError(error: unknown): GeminiApiFailureKind {
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("aborted") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout")
  ) {
    return "TIMEOUT";
  }
  if (
    lower.includes("unable_to_verify") ||
    lower.includes("certificate") ||
    lower.includes("cert")
  ) {
    return "TLS";
  }
  if (
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return "NETWORK";
  }
  return "UNKNOWN";
}

export function parseGeminiHttpErrorBody(
  httpStatus: number,
  rawText: string
): ParsedGeminiHttpError {
  let geminiMessage = rawText.slice(0, 500).trim() || `HTTP ${httpStatus}`;
  let geminiStatus: string | undefined;
  let geminiCode: number | undefined;

  try {
    const parsed = JSON.parse(rawText) as GenerateContentResponse & {
      error?: { message?: string; status?: string; code?: number };
    };
    if (parsed.error?.message) {
      geminiMessage = parsed.error.message;
      geminiStatus = parsed.error.status;
      geminiCode = parsed.error.code;
    }
  } catch {
    /* nem JSON — nyers szöveg marad */
  }

  return {
    httpStatus,
    geminiMessage,
    geminiStatus,
    geminiCode,
    rawBody: rawText,
  };
}

export function logGeminiApiFailure(entry: GeminiApiFailureLog): void {
  const payload = {
    ...entry,
    rawBody: entry.rawBody
      ? entry.rawBody.length > RAW_BODY_LOG_LIMIT
        ? `${entry.rawBody.slice(0, RAW_BODY_LOG_LIMIT)}\n…[truncated ${entry.rawBody.length - RAW_BODY_LOG_LIMIT} chars]`
        : entry.rawBody
      : undefined,
  };

  console.error(
    `[gemini-api] FAILURE ${entry.context}`,
    JSON.stringify(payload, null, 2)
  );

  if (entry.rawBody && entry.rawBody.length <= RAW_BODY_LOG_LIMIT) {
    console.error(`[gemini-api] FULL RESPONSE BODY ${entry.context}:\n`, entry.rawBody);
  }
}

export function logGeminiApiRetry(params: {
  context: string;
  model: string;
  kind: "overload" | "inner";
  fromAttempt: number;
  toAttempt: number;
  delayMs?: number;
  reason: string;
  previousError?: unknown;
}): void {
  console.warn(
    `[gemini-api] RETRY ${params.context}`,
    JSON.stringify({
      model: params.model,
      retryType: params.kind,
      fromAttempt: params.fromAttempt,
      toAttempt: params.toAttempt,
      delayMs: params.delayMs ?? null,
      reason: params.reason,
      previousError:
        params.previousError instanceof Error
          ? params.previousError.message
          : String(params.previousError ?? ""),
    })
  );
}

export function logGeminiApiSuccess(params: {
  context: string;
  model: string;
  durationMs: number;
  attempt: number;
  overloadRetry?: number;
  finishReason?: string;
}): void {
  console.log(
    `[gemini-api] OK ${params.context}`,
    JSON.stringify({
      model: params.model,
      durationMs: params.durationMs,
      attempt: params.attempt,
      overloadRetry: params.overloadRetry ?? 0,
      finishReason: params.finishReason ?? null,
    })
  );
}

export function buildGeminiApiErrorFromHttp(
  params: ParsedGeminiHttpError & {
    context: string;
    model: string;
    attempt: number;
    durationMs: number;
    overloadRetry?: number;
  }
): GeminiApiError {
  const kind = classifyGeminiHttpStatus(params.httpStatus);
  return new GeminiApiError({
    kind,
    message: params.geminiMessage,
    httpStatus: params.httpStatus,
    geminiMessage: params.geminiMessage,
    geminiStatus: params.geminiStatus,
    model: params.model,
    logContext: params.context,
    attempt: params.attempt,
    durationMs: params.durationMs,
    rawBody: params.rawBody,
    overloadRetry: params.overloadRetry,
  });
}

export function buildGeminiApiErrorFromNetwork(
  error: unknown,
  params: {
    context: string;
    model: string;
    attempt: number;
    durationMs: number;
    overloadRetry?: number;
  }
): GeminiApiError {
  const kind = classifyNetworkError(error);
  const message =
    error instanceof Error ? error.message : "Hálózati hiba a Gemini API felé.";

  return new GeminiApiError({
    kind,
    message,
    model: params.model,
    logContext: params.context,
    attempt: params.attempt,
    durationMs: params.durationMs,
    overloadRetry: params.overloadRetry,
    cause: error,
  });
}
