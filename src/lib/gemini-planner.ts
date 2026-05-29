import { GEMINI_PLANNER_MAX_OUTPUT_TOKENS, GEMINI_PLANNER_MODEL } from "./config";
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

  let parsed: DynamicPlannedDay | undefined;
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      parsed = parseJsonFromModelText<DynamicPlannedDay>(candidate);
      break;
    } catch {
      try {
        parsed = JSON.parse(candidate) as DynamicPlannedDay;
        break;
      } catch (e2) {
        lastError = e2;
      }
    }
  }

  if (!parsed) {
    console.error(
      "[planAndGenerateNextDay] JSON parse failed. Model text (first 2k):",
      raw.slice(0, 2000)
    );
    throw new Error(
      lastError instanceof Error
        ? `JSON feldolgozási hiba: ${lastError.message}`
        : "A modell válasza nem értelmezhető JSON-ként."
    );
  }

  if (parsed.dayNumber !== expectedDay) {
    throw new Error(
      `A Gemini ${parsed.dayNumber}. napot adott vissza, de ${expectedDay}. nap kellett volna.`
    );
  }

  if (
    !parsed.title?.trim() ||
    !parsed.verse?.trim() ||
    !parsed.content?.trim() ||
    !parsed.category?.trim()
  ) {
    throw new Error("Hiányzó mezők a Gemini válaszában (title, verse, content, category).");
  }

  const imageKeywords =
    parsed.imageKeywords?.trim() ||
    (parsed as { image_keywords?: string }).image_keywords?.trim() ||
    undefined;

  return {
    dayNumber: parsed.dayNumber,
    title: parsed.title.trim(),
    verse: parsed.verse.trim(),
    content: parsed.content.trim(),
    category: parsed.category.trim(),
    facebookCopy: parsed.facebookCopy?.trim() || undefined,
    imageKeywords,
  };
}

/**
 * Planner: plain JSON válasz, maxOutputTokens a configból, MAX_TOKENS esetén rövidített újrapróbálás.
 */
export async function planAndGenerateNextDay(
  memory: DevotionalMemory
): Promise<DynamicPlannedDay> {
  const systemInstruction = buildDynamicPlannerSystemPrompt();
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const shortened = attempt > 1;
    const userPrompt = buildDynamicPlannerUserPrompt(memory, { shortened });

    try {
      const { text: raw, finishReason } = await geminiGenerateContentRestDetailed({
        model: GEMINI_PLANNER_MODEL,
        systemInstruction,
        userPrompt,
        generationConfig: {
          temperature: shortened ? 0.5 : 0.65,
          maxOutputTokens: shortened ? 2048 : GEMINI_PLANNER_MAX_OUTPUT_TOKENS,
        },
        logContext: `planAndGenerateNextDay/attempt-${attempt}`,
        maxAttempts: 1,
      });

      const hitMaxTokens = finishReason === "MAX_TOKENS";

      if (hitMaxTokens && attempt < maxAttempts) {
        console.warn(
          `[planAndGenerateNextDay] MAX_TOKENS — újrapróbálás rövidített instrukcióval (${attempt + 1}/${maxAttempts}).`
        );
        continue;
      }

      let planned: DynamicPlannedDay;
      try {
        planned = parsePlannerResponse(raw, memory.nextDayNumber, {
          allowTruncatedRepair: hitMaxTokens,
        });
      } catch (parseError) {
        if (attempt < maxAttempts) {
          console.warn(
            `[planAndGenerateNextDay] JSON parse failed, retry ${attempt + 1}/${maxAttempts}`
          );
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
              "A modell válasza elérte a tokenlimitet és a levágott szöveg nem volt érvényes JSON. Próbáld újra — a rendszer rövidebb választ kér.",
          });
        }
        throw parseError;
      }

      if (hitMaxTokens) {
        console.warn(
          "[planAndGenerateNextDay] MAX_TOKENS — a részleges válasz JSON-ként feldolgozva."
        );
      }

      const ref = extractVerseReference(planned.verse);

      if (isVerseReferenceUsed(ref, memory.usedVerseReferences)) {
        throw new Error(
          `A generált vers már szerepelt a múltban: ${ref}. Próbáld újra a generálást.`
        );
      }

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

      if (attempt < maxAttempts && isRetriableGeminiResponseError(error)) {
        console.warn(
          `[planAndGenerateNextDay] Retry ${attempt + 1}/${maxAttempts}`
        );
        continue;
      }

      if (isGeminiResponseError(error)) {
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

  if (isGeminiResponseError(lastError)) {
    throw lastError;
  }

  const details = toGeminiErrorDetails(lastError);
  throw new Error(details.message, { cause: lastError });
}
