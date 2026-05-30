import {
  GEMINI_PLANNER_MAX_OUTPUT_TOKENS,
  GEMINI_PLANNER_MODEL,
  GEMINI_PLANNER_RETRY_MAX_OUTPUT_TOKENS,
} from "./config";
import {
  buildDynamicPlannerSystemPrompt,
  buildDynamicPlannerUserPrompt,
} from "./prompts/dynamic-planner-prompt";
import type { DevotionalMemory } from "./devotional-memory";
import { isVerseReferenceUsed, extractVerseReference } from "./devotional-memory";
import type { DynamicPlannedDay } from "./types";
import { logGeminiError } from "./gemini-client";
import {
  geminiGenerateContentRestDetailed,
  GeminiResponseError,
  isGeminiResponseError,
  isRetriableGeminiResponseError,
  logRawGeminiResponse,
  parseJsonFromModelText,
  repairTruncatedJsonObject,
} from "./gemini-fetch";
import { toGeminiErrorDetails } from "./gemini-errors";
import {
  mapRawGeminiToPlannedDay,
  type RawGeminiPlannedDay,
} from "./planned-day-mapper";

const LOG_PREFIX = "[planAndGenerateNextDay]";
const MAX_ATTEMPTS = 2;

type PlannerLogEvent =
  | "start"
  | "token_overflow"
  | "invalid_json_retry"
  | "retry"
  | "success"
  | "failure";

function plannerLog(
  event: PlannerLogEvent,
  meta?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${LOG_PREFIX} ${timestamp} — ${event}${payload}`);
}

function stripMarkdownJsonFences(text: string): string {
  return text.replace(/```json|```/gi, "").trim();
}

function parsePlannerResponse(
  raw: string,
  expectedDay: number,
  options?: { allowTruncatedRepair?: boolean }
): DynamicPlannedDay {
  const stripped = stripMarkdownJsonFences(raw);
  const candidates = [stripped];

  if (options?.allowTruncatedRepair) {
    candidates.push(repairTruncatedJsonObject(stripped));
  }

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(stripped.slice(start, end + 1));
  }

  let parsed: RawGeminiPlannedDay | undefined;
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      parsed = parseJsonFromModelText<RawGeminiPlannedDay>(candidate);
      break;
    } catch {
      try {
        parsed = JSON.parse(candidate) as RawGeminiPlannedDay;
        break;
      } catch (e2) {
        lastError = e2;
      }
    }
  }

  if (!parsed) {
    console.error(
      `${LOG_PREFIX} JSON parse failed. Model text (first 2k):`,
      raw.slice(0, 2000)
    );
    throw new Error(
      lastError instanceof Error
        ? `JSON feldolgozási hiba: ${lastError.message}`
        : "A modell válasza nem értelmezhető JSON-ként."
    );
  }

  return mapRawGeminiToPlannedDay(parsed, expectedDay);
}

/**
 * Planner: minimális JSON, maxOutputTokens 1400–1600, max 2 próbálkozás.
 */
export async function planAndGenerateNextDay(
  memory: DevotionalMemory
): Promise<DynamicPlannedDay> {
  const systemInstruction = buildDynamicPlannerSystemPrompt();
  let lastError: unknown;

  plannerLog("start", {
    dayNumber: memory.nextDayNumber,
    maxAttempts: MAX_ATTEMPTS,
    maxOutputTokens: GEMINI_PLANNER_MAX_OUTPUT_TOKENS,
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const shortened = attempt > 1;
    const userPrompt = buildDynamicPlannerUserPrompt(memory, { shortened });

    if (shortened) {
      plannerLog("retry", { attempt, reason: lastError instanceof Error ? lastError.message : "previous_failure" });
    }

    try {
      const maxOutputTokens = shortened
        ? GEMINI_PLANNER_RETRY_MAX_OUTPUT_TOKENS
        : GEMINI_PLANNER_MAX_OUTPUT_TOKENS;

      const { text: raw, finishReason } = await geminiGenerateContentRestDetailed({
        model: GEMINI_PLANNER_MODEL,
        systemInstruction,
        userPrompt,
        generationConfig: {
          temperature: shortened ? 0.55 : 0.7,
          maxOutputTokens,
        },
        logContext: `planAndGenerateNextDay/attempt-${attempt}`,
        maxAttempts: 1,
      });

      const hitMaxTokens = finishReason === "MAX_TOKENS";

      if (hitMaxTokens) {
        plannerLog("token_overflow", {
          attempt,
          finishReason,
          responseChars: raw.length,
          maxOutputTokens,
        });
      }

      if (hitMaxTokens && attempt < MAX_ATTEMPTS) {
        continue;
      }

      let planned: DynamicPlannedDay;
      try {
        planned = parsePlannerResponse(raw, memory.nextDayNumber, {
          allowTruncatedRepair: hitMaxTokens,
        });
      } catch (parseError) {
        if (attempt < MAX_ATTEMPTS) {
          plannerLog("invalid_json_retry", {
            attempt,
            nextAttempt: attempt + 1,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          lastError = parseError;
          continue;
        }

        if (hitMaxTokens) {
          throw new GeminiResponseError({
            issue: "MAX_TOKENS",
            finishReason,
            diagnostics: `parse failed after MAX_TOKENS, ${raw.length} chars`,
            partialText: raw.slice(0, 500),
            message:
              "A modell válasza elérte a tokenlimitet és a levágott szöveg nem volt érvényes JSON. Próbáld újra.",
          });
        }
        throw parseError;
      }

      const ref = extractVerseReference(planned.verse);

      if (isVerseReferenceUsed(ref, memory.usedVerseReferences)) {
        throw new Error(
          `A generált vers már szerepelt a múltban: ${ref}. Próbáld újra a generálást.`
        );
      }

      plannerLog("success", {
        attempt,
        dayNumber: planned.dayNumber,
        title: planned.title,
        contentChars: planned.content.length,
        hitMaxTokens,
      });

      return planned;
    } catch (error) {
      lastError = error;

      if (
        error instanceof Error &&
        error.message.includes("szerepelt a múltban")
      ) {
        throw error;
      }

      logGeminiError(error, `planAndGenerateNextDay attempt ${attempt}`);

      if (attempt < MAX_ATTEMPTS && isRetriableGeminiResponseError(error)) {
        plannerLog("retry", {
          attempt,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (isGeminiResponseError(error)) {
        plannerLog("failure", {
          attempt,
          code: error.issue,
          message: error.message,
        });
        throw error;
      }

      break;
    }
  }

  logRawGeminiResponse(
    "planAndGenerateNextDay/final-failure",
    null,
    lastError instanceof Error ? lastError.message : String(lastError)
  );

  plannerLog("failure", {
    attempts: MAX_ATTEMPTS,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });

  if (isGeminiResponseError(lastError)) {
    throw lastError;
  }

  const details = toGeminiErrorDetails(lastError);
  throw new Error(details.message, { cause: lastError });
}
