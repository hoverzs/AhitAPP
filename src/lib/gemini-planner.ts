import {
  GEMINI_BODY_MAX_OUTPUT_TOKENS,
  GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS,
  GEMINI_METADATA_MAX_OUTPUT_TOKENS,
  GEMINI_PLANNER_MODEL,
  GEMINI_PLANNER_RETRY_TEMPERATURE,
  GEMINI_PLANNER_TEMPERATURE,
} from "./config";
import {
  normalizeDevotionalMarkdownBody,
  stripMarkdownFences,
  truncateDevotionalMarkdown,
} from "./devotional-markdown";
import {
  assessGeneratedDevotionalContent,
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
import { toGeminiErrorDetails } from "./gemini-errors";

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
  | "body_truncated"
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

async function fetchDevotionalMarkdown(
  metadata: DevotionalMetadata,
  memory: DevotionalMemory
): Promise<{
  markdown: string;
  truncated: boolean;
  hitMaxTokens: boolean;
  textComplete: boolean;
  incompleteReasons: string[];
}> {
  plannerLog("body_start", {
    dayNumber: memory.nextDayNumber,
    title: metadata.title,
  });

  let lastRaw = "";
  let hitMaxTokens = false;

  for (let attempt = 1; attempt <= BODY_MAX_ATTEMPTS; attempt++) {
    const shortened = attempt > 1;
    const userPrompt =
      buildBodyUserPrompt(metadata, { shortened }) +
      (shortened ? BODY_SHORT_RETRY_SUFFIX : "");

    if (shortened) {
      plannerLog("body_retry", { attempt });
    }

    try {
      const maxOutputTokens = shortened
        ? GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS
        : GEMINI_BODY_MAX_OUTPUT_TOKENS;

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
        logContext: `planAndGenerateNextDay/body-${attempt}`,
        maxAttempts: 1,
      });

      lastRaw = raw;
      const tokenCutoff = finishReason === "MAX_TOKENS";
      if (tokenCutoff) {
        hitMaxTokens = true;
        plannerLog("body_token_overflow", {
          attempt,
          responseChars: raw.length,
          maxOutputTokens,
        });
      }

      const cleaned = normalizeDevotionalMarkdownBody(stripMarkdownFences(raw));
      const { markdown, truncated } = truncateDevotionalMarkdown(cleaned);

      if (truncated) {
        plannerLog("body_truncated", {
          attempt,
          originalChars: cleaned.length,
          finalChars: markdown.length,
        });
      }

      const assessment = assessGeneratedDevotionalContent(markdown, {
        shortened,
      });
      const structurallyIncomplete =
        truncated || tokenCutoff || !assessment.complete;

      if (structurallyIncomplete) {
        plannerLog("body_incomplete", {
          attempt,
          reasons: assessment.reasons,
          truncated,
          hitMaxTokens: tokenCutoff,
        });
      }

      if (structurallyIncomplete && attempt < BODY_MAX_ATTEMPTS) {
        continue;
      }

      plannerLog("body_success", {
        attempt,
        chars: markdown.length,
        hitMaxTokens: tokenCutoff,
        textComplete: assessment.complete && !truncated,
      });

      return {
        markdown,
        truncated,
        hitMaxTokens: tokenCutoff,
        textComplete: assessment.complete && !truncated,
        incompleteReasons: assessment.reasons,
      };
    } catch (error) {
      logGeminiError(error, `body attempt ${attempt}`);
      if (attempt < BODY_MAX_ATTEMPTS && isRetriableGeminiResponseError(error)) {
        continue;
      }
      if (lastRaw.trim()) break;
      throw error;
    }
  }

  if (lastRaw.trim()) {
    const cleaned = normalizeDevotionalMarkdownBody(stripMarkdownFences(lastRaw));
    const { markdown, truncated } = truncateDevotionalMarkdown(cleaned);
    const assessment = assessGeneratedDevotionalContent(markdown, {
      shortened: true,
    });
    plannerLog("body_fallback", {
      reason: "partial_markdown_after_max_tokens",
      chars: markdown.length,
      textComplete: assessment.complete && !truncated,
    });
    return {
      markdown,
      truncated,
      hitMaxTokens,
      textComplete: assessment.complete && !truncated,
      incompleteReasons: assessment.reasons,
    };
  }

  const fallback = normalizeDevotionalMarkdownBody(
    `### Elmélkedés\n\n${metadata.excerpt}\n\nTovábbi elmélkedés: ${metadata.title}`
  );
  const assessment = assessGeneratedDevotionalContent(fallback);
  plannerLog("body_fallback", { reason: "minimal_from_excerpt" });
  return {
    markdown: fallback,
    truncated: false,
    hitMaxTokens,
    textComplete: assessment.complete,
    incompleteReasons: assessment.reasons,
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
  });

  try {
    const metadata = await fetchMetadata(memory);
    const {
      markdown: devotionalMarkdown,
      textComplete,
      incompleteReasons,
      truncated,
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

    const contentAssessment = assessGeneratedDevotionalContent(planned.content);
    const complete =
      textComplete && contentAssessment.complete && !truncated;

    if (!complete) {
      plannerLog("body_incomplete", {
        phase: "assembled",
        reasons: incompleteReasons.length
          ? incompleteReasons
          : contentAssessment.reasons,
      });
    }

    return finalizePlanned(
      {
        ...planned,
        textComplete: complete,
        generationReviewMessage: complete
          ? undefined
          : TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE,
      },
      memory,
      { strategy: "two_step", textComplete: complete }
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
