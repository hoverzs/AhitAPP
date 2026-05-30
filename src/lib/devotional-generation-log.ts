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
}

const LOG_PREFIX = "[devotional-generation]";

export function logDevotionalGenerationDiagnostics(
  diagnostics: DevotionalGenerationDiagnostics
): void {
  console.log(`${LOG_PREFIX}`, JSON.stringify(diagnostics, null, 0));
}
