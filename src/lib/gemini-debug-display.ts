import type { GeminiErrorDebugInfo } from "./gemini-error-labels";

/** Admin UI meta sor dev debug mezőkből. */
export function formatGeminiDebugMeta(debug?: GeminiErrorDebugInfo): string | undefined {
  if (!debug) return undefined;

  const parts: string[] = [];
  if (debug.httpStatus != null) parts.push(`HTTP ${debug.httpStatus}`);
  if (debug.model) parts.push(debug.model);
  if (debug.durationMs != null) parts.push(`${debug.durationMs} ms`);
  if (debug.attempt != null) parts.push(`próba ${debug.attempt}`);
  if (debug.overloadRetry != null && debug.overloadRetry > 0) {
    parts.push(`overload retry ${debug.overloadRetry}`);
  }
  if (debug.geminiStatus) parts.push(debug.geminiStatus);
  if (debug.geminiMessage) {
    parts.push(
      debug.geminiMessage.length > 120
        ? `${debug.geminiMessage.slice(0, 120)}…`
        : debug.geminiMessage
    );
  }
  if (debug.technicalMessage && debug.technicalMessage !== debug.geminiMessage) {
    parts.push(debug.technicalMessage.slice(0, 160));
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
