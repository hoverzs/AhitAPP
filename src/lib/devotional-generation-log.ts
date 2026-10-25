/** Strukturált napló — devotional markdown generálás (admin / console). */

export interface DevotionalGenerationDiagnostics {
  sourceFunction: string;
  maxOutputTokens: number;
  finishReason: string;
  devotionalMarkdownLength: number;
  meditationLength: number;
  retryOccurred: boolean;
  attempt: number;
  textComplete: boolean;
  incompleteReasons?: string[];
  /** Gemini tokenhasználat (usageMetadata) — titkos adat nélkül. */
  thinkingBudget?: number;
  promptTokens?: number | null;
  outputTokens?: number | null;
  thoughtsTokens?: number | null;
  totalTokens?: number | null;
}

export function usageForLog(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}): Pick<DevotionalGenerationDiagnostics, "promptTokens" | "outputTokens" | "thoughtsTokens" | "totalTokens"> {
  return {
    promptTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
    thoughtsTokens: usage?.thoughtsTokenCount ?? null,
    totalTokens: usage?.totalTokenCount ?? null,
  };
}

const LOG_PREFIX = "[devotional-generation]";

export function logDevotionalGenerationDiagnostics(
  diagnostics: DevotionalGenerationDiagnostics
): void {
  console.log(`${LOG_PREFIX}`, JSON.stringify(diagnostics, null, 0));
}
