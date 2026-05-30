import { appendDevotional, readDevotionals, upsertDevotional } from "./devotionals";
import { buildDevotionalMemory } from "./devotional-memory";
import { extractPrayerAndReflection } from "./devotional-fields";
import { appendVersionSnapshot } from "./devotional-versions";
import { GEMINI_PLANNER_MODEL } from "./config";
import {
  defaultGeneratedStatus,
  DEV_REVIEW_MODE,
  PROMPT_VERSION,
} from "./dev-review";
import { ENABLE_IMAGE_GENERATION } from "./features";
import { resolveDevotionalImageForGeneration, deriveImageKeywordsFromPlan } from "./devotional-image";
import {
  getTodayDateIso,
  resolveAutoGenerationTarget,
  resolveManualGenerationTarget,
  resolveRegenerateTarget,
  type GenerationTarget,
} from "./generation-target";
import { logDevotionalGenerationDiagnostics } from "./devotional-generation-log";
import { parseTolerantDevotionalMarkdown } from "./devotional-body-parser";
import {
  isCompleteText,
  TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE,
} from "./devotional-text-complete";
import { planAndGenerateNextDay } from "./gemini-planner";
import { generateAndSaveImage } from "./google-ai";
import { isPexelsConfigured } from "./pexels";
import type { Devotional, DynamicPlannedDay } from "./types";

export class GenerationBlockedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "GenerationBlockedError";
    this.reason = reason;
  }
}

export class GenerationSkippedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "GenerationSkippedError";
    this.reason = reason;
  }
}

export interface GenerateDevotionalResult {
  devotional: Devotional;
  action: "create" | "update";
  targetDayNumber: number;
  backedUp?: boolean;
}

async function runGeminiForTarget(
  target: GenerationTarget,
  history: Devotional[]
): Promise<DynamicPlannedDay> {
  const historyForMemory =
    target.action === "update"
      ? history.filter((d) => d.dayNumber !== target.dayNumber)
      : history;

  const memory = buildDevotionalMemory(historyForMemory, {
    nextDayNumber: target.dayNumber,
  });

  return planAndGenerateNextDay(memory);
}

async function buildDevotionalFromPlan(
  planned: DynamicPlannedDay,
  target: GenerationTarget,
  options?: { existing?: Devotional; versionHistory?: Devotional["versionHistory"] }
): Promise<Devotional> {
  const { prayer, reflectionQuestion } = extractPrayerAndReflection(planned.content);

  const now = new Date().toISOString();
  const isUpdate = target.action === "update";
  const existing = options?.existing ?? target.existing;

  let imageUrl = existing?.imageUrl ?? "";
  let imageSource = existing?.imageSource;
  let imageCredit = existing?.imageCredit;
  let imagePhotographerUrl = existing?.imagePhotographerUrl;
  let pexelsPhotoId = existing?.pexelsPhotoId;

  if (ENABLE_IMAGE_GENERATION) {
    imageUrl = await generateAndSaveImage(
      planned.dayNumber,
      planned.verse,
      `symbolic devotional scene for ${planned.category}`
    );
    imageSource = "imagen";
    imageCredit = undefined;
    imagePhotographerUrl = undefined;
    pexelsPhotoId = undefined;
  } else {
    const resolved = await resolveDevotionalImageForGeneration(planned, existing);
    imageUrl = resolved.imageUrl;
    imageSource = resolved.imageSource;
    imageCredit = resolved.imageCredit;
    imagePhotographerUrl = resolved.imagePhotographerUrl;
    pexelsPhotoId = resolved.pexelsPhotoId;

    if (resolved.assigned) {
      console.info(
        `[buildDevotionalFromPlan] Automatikus Pexels kép: day ${target.dayNumber}, photo ${pexelsPhotoId ?? "?"}`
      );
    } else if (isPexelsConfigured()) {
      console.info(
        `[buildDevotionalFromPlan] Nincs Pexels találat — day ${target.dayNumber}, fallback kép publikus oldalon.`
      );
    }
  }

  const imageKeywords =
    planned.imageKeywords?.trim() ||
    existing?.imageKeywords?.trim() ||
    deriveImageKeywordsFromPlan(planned);

  const keepStatus =
    isUpdate &&
    existing &&
    (existing.status === "published" || existing.status === "approved") &&
    planned.textComplete !== false;

  const meditation = parseTolerantDevotionalMarkdown(planned.content, {
    log: false,
  }).devotional;
  const meditationComplete = isCompleteText(meditation, { minChars: 450 });
  const incomplete = planned.textComplete !== true || !meditationComplete;

  if (planned.generationDiagnostics) {
    logDevotionalGenerationDiagnostics({
      ...planned.generationDiagnostics,
      attempt: 0,
      textComplete: !incomplete,
      incompleteReasons: incomplete ? ["pre_save_validation_failed"] : undefined,
    });
  }

  console.log("[buildDevotionalFromPlan] pre-save validation:", {
    sourceFunction: planned.generationDiagnostics?.sourceFunction ?? "unknown",
    maxOutputTokens: planned.generationDiagnostics?.maxOutputTokens,
    finishReason: planned.generationDiagnostics?.finishReason,
    devotionalLength: planned.content.length,
    meditationLength: meditation.length,
    retryOccurred: planned.generationDiagnostics?.retryOccurred ?? false,
    textComplete: !incomplete,
    meditationComplete,
  });

  let status = keepStatus ? existing!.status! : defaultGeneratedStatus();
  if (incomplete) {
    status = "needs_review";
  }

  return {
    dayNumber: target.dayNumber,
    date: target.date,
    title: planned.title,
    verse: planned.verse,
    content: planned.content,
    prayer,
    reflectionQuestion,
    category: planned.category,
    imageUrl,
    imageKeywords,
    imageSource,
    imageCredit,
    imagePhotographerUrl,
    pexelsPhotoId,
    facebookCopy: planned.excerpt?.trim() || planned.facebookCopy,
    status,
    promptVersion: PROMPT_VERSION,
    generationModel: GEMINI_PLANNER_MODEL,
    contentCharCount: planned.content.length,
    lastApiError: incomplete
      ? (planned.generationReviewMessage ?? TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE)
      : undefined,
    editedByAdmin: false,
    versionHistory: options?.versionHistory ?? existing?.versionHistory,
    createdAt: isUpdate ? (existing?.createdAt ?? now) : now,
    generatedAt: now,
    updatedAt: now,
  };
}

export async function generateNextDevotional(): Promise<GenerateDevotionalResult> {
  const history = await readDevotionals();
  const target = resolveManualGenerationTarget(history);

  if (target.action === "blocked") {
    throw new GenerationBlockedError(
      target.blockedReason ??
        "A mai áhítat még nincs jóváhagyva. Fejlesztői módban nem generálunk további napokat."
    );
  }

  if (target.action === "skip") {
    throw new GenerationSkippedError(target.skipReason ?? "Generálás kihagyva.");
  }

  const planned = await runGeminiForTarget(target, history);
  const devotional = await buildDevotionalFromPlan(planned, target);

  if (devotional.status === "published" && planned.textComplete !== true) {
    devotional.status = "needs_review";
    devotional.lastApiError = TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE;
  }

  const saved =
    target.action === "update"
      ? await upsertDevotional(devotional)
      : await appendDevotional(devotional);

  return {
    devotional: saved,
    action: target.action,
    targetDayNumber: target.dayNumber,
  };
}

export async function regenerateDevotional(
  dayNumber: number,
  options?: { backup?: boolean }
): Promise<GenerateDevotionalResult> {
  const history = await readDevotionals();
  const target = resolveRegenerateTarget(history, dayNumber);
  const existing = target.existing!;

  const versionHistory =
    options?.backup !== false
      ? appendVersionSnapshot(existing, "regenerate")
      : existing.versionHistory;

  const planned = await runGeminiForTarget(target, history);
  const devotional = await buildDevotionalFromPlan(planned, target, {
    existing,
    versionHistory,
  });

  devotional.date = existing.date;
  const saved = await upsertDevotional(devotional);

  return {
    devotional: saved,
    action: "update",
    targetDayNumber: dayNumber,
    backedUp: options?.backup !== false,
  };
}

export async function autoGenerateDailyDevotional(
  date: string = getTodayDateIso(),
  options?: { forcePublished?: boolean }
): Promise<GenerateDevotionalResult> {
  const history = await readDevotionals();
  const target = resolveAutoGenerationTarget(history, date);

  if (target.action === "skip") {
    throw new GenerationSkippedError(target.skipReason ?? "Már van tartalom.");
  }

  if (target.action === "blocked") {
    throw new GenerationBlockedError(target.blockedReason ?? "Generálás blokkolva.");
  }

  const planned = await runGeminiForTarget(target, history);
  const devotional = await buildDevotionalFromPlan(planned, target);

  if (
    options?.forcePublished &&
    !DEV_REVIEW_MODE &&
    planned.textComplete === true
  ) {
    devotional.status = "published";
  } else if (planned.textComplete !== true) {
    devotional.status = "needs_review";
    devotional.lastApiError =
      planned.generationReviewMessage ?? TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE;
  } else {
    devotional.status = defaultGeneratedStatus();
  }

  const saved = await appendDevotional(devotional);

  return {
    devotional: saved,
    action: "create",
    targetDayNumber: target.dayNumber,
  };
}

export async function loadGenerationMemory() {
  const history = await readDevotionals();
  const target = resolveManualGenerationTarget(history);
  const memory = buildDevotionalMemory(history, {
    nextDayNumber: target.dayNumber,
  });
  return { memory, target };
}
