import {
  GEMINI_BODY_MAX_OUTPUT_TOKENS,
  GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS,
  GEMINI_METADATA_MAX_OUTPUT_TOKENS,
  GEMINI_PLANNER_MODEL,
  GEMINI_PLANNER_RETRY_TEMPERATURE,
  GEMINI_PLANNER_TEMPERATURE,
} from "./config";
import { parseTolerantDevotionalMarkdown } from "./devotional-body-parser";
import { logDevotionalGenerationDiagnostics } from "./devotional-generation-log";
import {
  normalizeDevotionalMarkdownBody,
  stripMarkdownFences,
} from "./devotional-markdown";
import {
  assessRawDevotionalMarkdown,
  TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE,
} from "./devotional-text-complete";
import {
  BODY_SHORT_RETRY_SUFFIX,
  BODY_SYSTEM_PROMPT,
  buildBodyUserPrompt,
} from "./prompts/devotional-body-prompt";
import {
  buildMetadataUserPrompt,
  METADATA_SYSTEM_PROMPT,
} from "./prompts/devotional-metadata-prompt";
import type { DevotionalMemory } from "./devotional-memory";
import { isVerseReferenceUsed, extractVerseReference } from "./devotional-memory";
import type { DynamicPlannedDay } from "./types";
import { logGeminiError } from "./gemini-client";
import {
  assemblePlannedDayFromParts,
  parseMetadataJson,
  type DevotionalMetadata,
} from "./planned-day-mapper";
import {
  geminiGenerateContentRestDetailed,
  isGeminiResponseError,
  isRetriableGeminiResponseError,
  logRawGeminiResponse,
} from "./gemini-fetch";
import { isGeminiOutputTruncated } from "./gemini-response";
import { toGeminiErrorDetails } from "./gemini-errors";

/** Elmélkedés + teljes áhítat markdown — plain text, nem JSON. */
const BODY_SOURCE_FUNCTION = "fetchDevotionalMarkdown";

const LOG_PREFIX = "[planAndGenerateNextDay]";
const METADATA_MAX_ATTEMPTS = 2;
const BODY_MAX_ATTEMPTS = 2;

type PlannerLogEvent =
  | "start"
  | "metadata_start"
  | "metadata_success"
  | "metadata_invalid_json"
  | "metadata_retry"
  | "body_start"
  | "body_success"
  | "body_token_overflow"
  | "body_retry"
  | "body_incomplete"
  | "body_fallback"
  | "assemble_success"
  | "failure";

function plannerLog(
  event: PlannerLogEvent,
  meta?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${LOG_PREFIX} ${timestamp} — ${event}${payload}`);
}

function finalizePlanned(
  planned: DynamicPlannedDay,
  memory: DevotionalMemory,
  meta: Record<string, unknown>
): DynamicPlannedDay {
  const ref = extractVerseReference(planned.verse);

  if (isVerseReferenceUsed(ref, memory.usedVerseReferences)) {
    throw new Error(
      `A generált vers már szerepelt a múltban: ${ref}. Próbáld újra a generálást.`
    );
  }

  plannerLog("assemble_success", {
    dayNumber: planned.dayNumber,
    title: planned.title,
    contentChars: planned.content.length,
    ...meta,
  });

  return planned;
}

async function fetchMetadata(
  memory: DevotionalMemory
): Promise<DevotionalMetadata> {
  plannerLog("metadata_start", { dayNumber: memory.nextDayNumber });
  let lastMetadataError: unknown;

  for (let attempt = 1; attempt <= METADATA_MAX_ATTEMPTS; attempt++) {
    try {
      const { text: raw } = await geminiGenerateContentRestDetailed({
        model: GEMINI_PLANNER_MODEL,
        systemInstruction: METADATA_SYSTEM_PROMPT,
        userPrompt: buildMetadataUserPrompt(memory),
        generationConfig: {
          temperature: GEMINI_PLANNER_TEMPERATURE,
          maxOutputTokens: GEMINI_METADATA_MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
        },
        logContext: `planAndGenerateNextDay/metadata-${attempt}`,
        maxAttempts: 1,
      });

      const metadata = parseMetadataJson(raw);

      plannerLog("metadata_success", {
        attempt,
        title: metadata.title,
        category: metadata.category,
        maxOutputTokens: GEMINI_METADATA_MAX_OUTPUT_TOKENS,
      });
      return metadata;
    } catch (error) {
      lastMetadataError = error;
      plannerLog("metadata_invalid_json", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < METADATA_MAX_ATTEMPTS) {
        plannerLog("metadata_retry", { attempt });
        continue;
      }
    }
  }

  plannerLog("body_fallback", {
    phase: "metadata",
    reason: "using_defaults",
    error: lastMetadataError instanceof Error ? lastMetadataError.message : undefined,
  });

  return {
    title: `${memory.nextDayNumber}. nap áhítata`,
    scripture: "Zsoltárok 23:1 — Az Úr az én pásztorom",
    category: memory.usedCategories.at(-1) || "Békesség",
    excerpt: "Egy rövid pillanat csendben Isten előtt.",
    imageKeywords: "quiet path, soft light, still lake, dawn",
  };
}

/**
 * 2. lépés: teljes áhítat plain markdown (### Elmélkedés, ima, kérdés).
 * Token limit: GEMINI_BODY_MAX_OUTPUT_TOKENS (2500).
 */
async function fetchDevotionalMarkdown(
  metadata: DevotionalMetadata,
  memory: DevotionalMemory
): Promise<{
  markdown: string;
  hitMaxTokens: boolean;
  textComplete: boolean;
  incompleteReasons: string[];
  generationDiagnostics: NonNullable<DynamicPlannedDay["generationDiagnostics"]>;
}> {
  plannerLog("body_start", {
    sourceFunction: BODY_SOURCE_FUNCTION,
    dayNumber: memory.nextDayNumber,
    title: metadata.title,
    maxOutputTokens: GEMINI_BODY_MAX_OUTPUT_TOKENS,
  });

  let lastRaw = "";
  let lastFinishReason = "UNKNOWN";
  let lastMaxOutputTokens = GEMINI_BODY_MAX_OUTPUT_TOKENS;
  let retryOccurred = false;

  for (let attempt = 1; attempt <= BODY_MAX_ATTEMPTS; attempt++) {
    const shortened = attempt > 1;
    if (shortened) {
      retryOccurred = true;
      plannerLog("body_retry", { attempt, sourceFunction: BODY_SOURCE_FUNCTION });
    }

    const userPrompt =
      buildBodyUserPrompt(metadata, { shortened }) +
      (shortened ? BODY_SHORT_RETRY_SUFFIX : "");

    const maxOutputTokens = shortened
      ? GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS
      : GEMINI_BODY_MAX_OUTPUT_TOKENS;
    lastMaxOutputTokens = maxOutputTokens;

    try {
      const { text: raw, finishReason } = await geminiGenerateContentRestDetailed({
        model: GEMINI_PLANNER_MODEL,
        systemInstruction: BODY_SYSTEM_PROMPT,
        userPrompt,
        generationConfig: {
          temperature: shortened
            ? GEMINI_PLANNER_RETRY_TEMPERATURE
            : GEMINI_PLANNER_TEMPERATURE,
          maxOutputTokens,
        },
        logContext: `${BODY_SOURCE_FUNCTION}/attempt-${attempt}`,
        maxAttempts: 1,
      });

      lastRaw = raw;
      lastFinishReason = finishReason;

      const stripped = stripMarkdownFences(raw);
      const parsed = parseTolerantDevotionalMarkdown(stripped, { log: false });
      const tokenCutoff = isGeminiOutputTruncated(finishReason);

      if (tokenCutoff) {
        plannerLog("body_token_overflow", {
          sourceFunction: BODY_SOURCE_FUNCTION,
          attempt,
          finishReason,
          responseChars: raw.length,
          maxOutputTokens,
        });
      }

      const assessment = assessRawDevotionalMarkdown(stripped, {
        shortened,
        finishReason,
      });

      logDevotionalGenerationDiagnostics({
        sourceFunction: BODY_SOURCE_FUNCTION,
        maxOutputTokens,
        finishReason,
        devotionalMarkdownLength: stripped.length,
        meditationLength: parsed.devotional.length,
        retryOccurred,
        attempt,
        textComplete: assessment.complete,
        incompleteReasons: assessment.reasons,
      });

      if (!assessment.complete) {
        plannerLog("body_incomplete", {
          sourceFunction: BODY_SOURCE_FUNCTION,
          attempt,
          finishReason,
          reasons: assessment.reasons,
          maxOutputTokens,
        });
      }

      if (!assessment.complete && attempt < BODY_MAX_ATTEMPTS) {
        continue;
      }

      const markdown = normalizeDevotionalMarkdownBody(stripped);

      plannerLog("body_success", {
        sourceFunction: BODY_SOURCE_FUNCTION,
        attempt,
        chars: markdown.length,
        finishReason,
        maxOutputTokens,
        textComplete: assessment.complete,
        retryOccurred,
      });

      const diagnostics = {
        sourceFunction: BODY_SOURCE_FUNCTION,
        maxOutputTokens,
        finishReason,
        devotionalMarkdownLength: stripped.length,
        meditationLength: parsed.devotional.length,
        retryOccurred,
      };

      return {
        markdown,
        hitMaxTokens: tokenCutoff,
        textComplete: assessment.complete,
        incompleteReasons: assessment.reasons,
        generationDiagnostics: diagnostics,
      };
    } catch (error) {
      logGeminiError(error, `${BODY_SOURCE_FUNCTION} attempt ${attempt}`);
      if (attempt < BODY_MAX_ATTEMPTS && isRetriableGeminiResponseError(error)) {
        retryOccurred = true;
        continue;
      }
      if (lastRaw.trim()) break;
      throw error;
    }
  }

  if (lastRaw.trim()) {
    const stripped = stripMarkdownFences(lastRaw);
    const parsed = parseTolerantDevotionalMarkdown(stripped, { log: false });
    const assessment = assessRawDevotionalMarkdown(stripped, {
      shortened: true,
      finishReason: lastFinishReason,
    });
    const markdown = normalizeDevotionalMarkdownBody(stripped);

    logDevotionalGenerationDiagnostics({
      sourceFunction: BODY_SOURCE_FUNCTION,
      maxOutputTokens: lastMaxOutputTokens,
      finishReason: lastFinishReason,
      devotionalMarkdownLength: stripped.length,
      meditationLength: parsed.devotional.length,
      retryOccurred,
      attempt: BODY_MAX_ATTEMPTS,
      textComplete: assessment.complete,
      incompleteReasons: assessment.reasons,
    });

    plannerLog("body_fallback", {
      sourceFunction: BODY_SOURCE_FUNCTION,
      reason: "partial_markdown_after_retries",
      finishReason: lastFinishReason,
      chars: markdown.length,
      textComplete: assessment.complete,
    });

    return {
      markdown,
      hitMaxTokens: isGeminiOutputTruncated(lastFinishReason),
      textComplete: assessment.complete,
      incompleteReasons: assessment.reasons,
      generationDiagnostics: {
        sourceFunction: BODY_SOURCE_FUNCTION,
        maxOutputTokens: lastMaxOutputTokens,
        finishReason: lastFinishReason,
        devotionalMarkdownLength: stripped.length,
        meditationLength: parsed.devotional.length,
        retryOccurred,
      },
    };
  }

  const fallback = normalizeDevotionalMarkdownBody(
    `### Elmélkedés\n\n${metadata.excerpt}\n\nTovábbi elmélkedés: ${metadata.title}`
  );
  plannerLog("body_fallback", {
    sourceFunction: BODY_SOURCE_FUNCTION,
    reason: "minimal_from_excerpt",
  });

  return {
    markdown: fallback,
    hitMaxTokens: false,
    textComplete: false,
    incompleteReasons: ["empty_gemini_response"],
    generationDiagnostics: {
      sourceFunction: BODY_SOURCE_FUNCTION,
      maxOutputTokens: lastMaxOutputTokens,
      finishReason: lastFinishReason,
      devotionalMarkdownLength: 0,
      meditationLength: 0,
      retryOccurred,
    },
  };
}

/**
 * Kétlépcsős generálás: (A) rövid metadata JSON → (B) plain markdown áhítat.
 */
export async function planAndGenerateNextDay(
  memory: DevotionalMemory
): Promise<DynamicPlannedDay> {
  plannerLog("start", {
    dayNumber: memory.nextDayNumber,
    strategy: "two_step",
    bodyGenerator: BODY_SOURCE_FUNCTION,
  });

  try {
    const metadata = await fetchMetadata(memory);
    const {
      markdown: devotionalMarkdown,
      textComplete,
      incompleteReasons,
      generationDiagnostics,
    } = await fetchDevotionalMarkdown(metadata, memory);

    const planned = assemblePlannedDayFromParts(
      {
        title: metadata.title,
        scripture: metadata.scripture,
        category: metadata.category,
        excerpt: metadata.excerpt,
        devotionalMarkdown,
        imageKeywords: metadata.imageKeywords,
      },
      memory.nextDayNumber
    );

    const complete = textComplete;

    if (!complete) {
      plannerLog("body_incomplete", {
        phase: "pre_save",
        sourceFunction: BODY_SOURCE_FUNCTION,
        reasons: incompleteReasons,
        finishReason: generationDiagnostics.finishReason,
      });
    }

    return finalizePlanned(
      {
        ...planned,
        textComplete: complete,
        generationReviewMessage: complete
          ? undefined
          : TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE,
        generationDiagnostics,
      },
      memory,
      {
        strategy: "two_step",
        textComplete: complete,
        finishReason: generationDiagnostics.finishReason,
        maxOutputTokens: generationDiagnostics.maxOutputTokens,
        retryOccurred: generationDiagnostics.retryOccurred,
      }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("szerepelt a múltban")
    ) {
      throw error;
    }

    logGeminiError(error, "planAndGenerateNextDay");
    logRawGeminiResponse(
      "planAndGenerateNextDay/final-failure",
      null,
      error instanceof Error ? error.message : String(error)
    );

    plannerLog("failure", {
      error: error instanceof Error ? error.message : String(error),
    });

    if (isGeminiResponseError(error)) {
      throw error;
    }

    const details = toGeminiErrorDetails(error);
    throw new Error(details.message, { cause: error });
  }
}
