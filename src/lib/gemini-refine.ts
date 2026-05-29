import { GEMINI_PLANNER_MAX_OUTPUT_TOKENS, GEMINI_PLANNER_MODEL } from "./config";
import { extractPrayerAndReflection } from "./devotional-fields";
import {
  buildDevotionalRefineSystemPrompt,
  buildDevotionalRefineUserPrompt,
} from "./prompts/devotional-refine-prompt";
import { logGeminiError } from "./gemini-client";
import {
  geminiGenerateContentRestDetailed,
  isRetriableGeminiResponseError,
  parseJsonFromModelText,
  repairTruncatedJsonObject,
} from "./gemini-fetch";
import { toGeminiErrorDetails } from "./gemini-errors";
import type { Devotional, DevotionalRefinementResult } from "./types";

function stripMarkdownJsonFences(text: string): string {
  return text.replace(/```json|```/gi, "").trim();
}

function parseRefineResponse(
  raw: string,
  options?: { allowTruncatedRepair?: boolean }
): DevotionalRefinementResult {
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

  type RawRefine = DevotionalRefinementResult & {
    reflection_question?: string;
    facebook_summary?: string;
    image_keywords?: string;
  };

  let parsed: RawRefine | undefined;
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      parsed = parseJsonFromModelText<RawRefine>(candidate);
      break;
    } catch {
      try {
        parsed = JSON.parse(candidate) as RawRefine;
        break;
      } catch (e2) {
        lastError = e2;
      }
    }
  }

  if (!parsed) {
    console.error(
      "[refineDevotional] JSON parse failed. Model text (first 2k):",
      raw.slice(0, 2000)
    );
    throw new Error(
      lastError instanceof Error
        ? `JSON feldolgozási hiba: ${lastError.message}`
        : "A modell válasza nem értelmezhető JSON-ként."
    );
  }

  if (
    !parsed.title?.trim() ||
    !parsed.verse?.trim() ||
    !parsed.content?.trim() ||
    !parsed.category?.trim()
  ) {
    throw new Error("Hiányzó mezők a finomított válaszban (title, verse, content, category).");
  }

  const reflectionQuestion =
    parsed.reflectionQuestion?.trim() ||
    parsed.reflection_question?.trim() ||
    undefined;

  const facebookCopy =
    parsed.facebookCopy?.trim() ||
    parsed.facebook_summary?.trim() ||
    undefined;

  const imageKeywords =
    parsed.imageKeywords?.trim() ||
    parsed.image_keywords?.trim() ||
    undefined;

  const extracted = extractPrayerAndReflection(parsed.content.trim());

  return {
    title: parsed.title.trim(),
    verse: parsed.verse.trim(),
    category: parsed.category.trim(),
    content: parsed.content.trim(),
    prayer: parsed.prayer?.trim() || extracted.prayer,
    reflectionQuestion: reflectionQuestion || extracted.reflectionQuestion,
    facebookCopy,
    imageKeywords,
  };
}

/**
 * Meglévő áhítat célzott Gemini finomítása — nem ment, csak preview eredményt ad.
 */
export async function refineDevotionalWithGemini(
  devotional: Devotional,
  instruction: string,
  options?: { updateImageKeywords?: boolean }
): Promise<DevotionalRefinementResult> {
  const trimmedInstruction = instruction.trim();
  if (!trimmedInstruction) {
    throw new Error("Az instrukció mező nem lehet üres.");
  }

  const systemInstruction = buildDevotionalRefineSystemPrompt();
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const shortened = attempt > 1;
    const userPrompt = buildDevotionalRefineUserPrompt(devotional, trimmedInstruction, {
      updateImageKeywords: options?.updateImageKeywords,
    });

    try {
      const { text: raw, finishReason } = await geminiGenerateContentRestDetailed({
        model: GEMINI_PLANNER_MODEL,
        systemInstruction,
        userPrompt: shortened
          ? `${userPrompt}\n\nReturn compact JSON only. Keep content concise.`
          : userPrompt,
        generationConfig: {
          temperature: shortened ? 0.45 : 0.55,
          maxOutputTokens: shortened ? 3072 : GEMINI_PLANNER_MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
        },
        logContext: `refineDevotional/attempt-${attempt}`,
        maxAttempts: 1,
      });

      const allowTruncatedRepair =
        finishReason === "MAX_TOKENS" || finishReason === "LENGTH";

      return parseRefineResponse(raw, { allowTruncatedRepair });
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetriableGeminiResponseError(error)) {
        console.warn(`[refineDevotional] Retrying (attempt ${attempt + 1})…`);
        continue;
      }
      logGeminiError(error, "refineDevotionalWithGemini");
      const details = toGeminiErrorDetails(error);
      throw new Error(details.message);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Finomítás sikertelen.");
}
