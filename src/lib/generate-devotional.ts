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
    (existing.status === "published" || existing.status === "approved");

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
    status: keepStatus ? existing!.status! : defaultGeneratedStatus(),
    promptVersion: PROMPT_VERSION,
    generationModel: GEMINI_PLANNER_MODEL,
    contentCharCount: planned.content.length,
    lastApiError: undefined,
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

  if (options?.forcePublished && !DEV_REVIEW_MODE) {
    devotional.status = "published";
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
