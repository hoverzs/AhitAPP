import { isGeminiApiError } from "./gemini-api-error";

/**
 * Gemini 503 / UNAVAILABLE / „high demand” — késleltetett automatikus újrapróbálás.
 */

/** Várakozás az 1., 2. és 3. újrapróba előtt (ms). */
export const GEMINI_OVERLOAD_RETRY_DELAYS_MS = [3000, 8000, 15000] as const;

export const GEMINI_OVERLOAD_MAX_ATTEMPTS =
  GEMINI_OVERLOAD_RETRY_DELAYS_MS.length + 1;

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if (error.cause) {
      parts.push(
        error.cause instanceof Error ? error.cause.message : String(error.cause)
      );
    }
  } else {
    parts.push(String(error));
  }
  return parts.join(" ").toLowerCase();
}

function unwrapApiError(error: unknown): unknown {
  if (isGeminiApiError(error)) return error;
  if (error instanceof Error && isGeminiApiError(error.cause)) {
    return error.cause;
  }
  return error;
}

/** HTTP 503, UNAVAILABLE, high demand, overloaded stb. */
export function isGeminiOverloadError(error: unknown): boolean {
  const api = unwrapApiError(error);
  if (isGeminiApiError(api) && api.kind === "OVERLOAD") {
    return true;
  }

  const combined = collectErrorText(error);

  if (
    /\b503\b/.test(combined) ||
    combined.includes("http 503") ||
    combined.includes("status: 503") ||
    combined.includes('"code":503')
  ) {
    return true;
  }

  if (
    combined.includes("unavailable") ||
    combined.includes("high demand") ||
    combined.includes("overloaded") ||
    combined.includes("resource has been exhausted") ||
    combined.includes("resource_exhausted") ||
    combined.includes("capacity") && combined.includes("exceed")
  ) {
    return true;
  }

  return (
    combined.includes("try again") &&
    (combined.includes("later") || combined.includes("503") || combined.includes("unavailable"))
  );
}

export function getGeminiOverloadRetryUserMessage(
  retryIndex: number,
  delayMs: number
): string {
  const seconds = Math.round(delayMs / 1000);
  if (retryIndex === 0) {
    return `A Gemini szolgáltatás átmenetileg túlterhelt. Automatikus újrapróbálás ${seconds} másodperc múlva…`;
  }
  if (retryIndex === 1) {
    return `Még mindig nagy a terhelés — második automatikus próba ${seconds} másodperc múlva…`;
  }
  return `Harmadik automatikus próba ${seconds} másodperc múlva…`;
}

export function getGeminiOverloadExhaustedMessage(): string {
  return "A Gemini API átmenetileg túlterhelt. Három automatikus újrapróbálás után sem sikerült — kérjük, várj 1–2 percet, majd próbáld újra.";
}

export function logGeminiOverloadRetry(
  context: string,
  retryIndex: number,
  delayMs: number,
  error: unknown
): void {
  const message =
    error instanceof Error ? error.message : String(error);
  console.warn(
    `[${context}] Gemini overload — waiting ${delayMs}ms before retry ${retryIndex + 1}/${GEMINI_OVERLOAD_RETRY_DELAYS_MS.length}`,
    message.slice(0, 200)
  );
}
