import { extractPrayerAndReflection } from "./devotional-fields";
import { appendVersionSnapshot } from "./devotional-versions";
import { refineDevotionalWithGemini } from "./gemini-refine";
import { REFINE_PROMPT_VERSION } from "./prompts/devotional-refine-prompt";
import { getDevotionalByDay, upsertDevotional } from "./devotionals";
import type {
  Devotional,
  DevotionalRefinementResult,
  DevotionalStatus,
} from "./types";

export type RefinementStatusAfter = "needs_review" | "published" | "keep";

export interface RefinePreviewResult {
  refined: DevotionalRefinementResult;
  original: Pick<
    Devotional,
    "dayNumber" | "title" | "verse" | "content" | "category" | "facebookCopy"
  >;
}

export async function previewDevotionalRefinement(
  dayNumber: number,
  instruction: string,
  options?: { updateImageKeywords?: boolean }
): Promise<RefinePreviewResult> {
  const existing = await getDevotionalByDay(dayNumber);
  if (!existing) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const refined = await refineDevotionalWithGemini(existing, instruction, options);

  return {
    refined,
    original: {
      dayNumber: existing.dayNumber,
      title: existing.title,
      verse: existing.verse,
      content: existing.content,
      category: existing.category,
      facebookCopy: existing.facebookCopy,
    },
  };
}

export async function applyDevotionalRefinement(
  dayNumber: number,
  refined: DevotionalRefinementResult,
  options: {
    instruction: string;
    statusAfter: RefinementStatusAfter;
    updateImageKeywords?: boolean;
  }
): Promise<Devotional> {
  const existing = await getDevotionalByDay(dayNumber);
  if (!existing) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  if (!options.instruction.trim()) {
    throw new Error("Hiányzó instrukció.");
  }

  const extracted = extractPrayerAndReflection(refined.content);
  const now = new Date().toISOString();

  let status: DevotionalStatus | undefined;
  if (options.statusAfter === "needs_review") {
    status = "needs_review";
  } else if (options.statusAfter === "published") {
    status = "published";
  }

  const versionHistory = appendVersionSnapshot(existing, "ai_iteration", {
    instruction: options.instruction,
  });

  const updated: Devotional = {
    ...existing,
    title: refined.title.trim(),
    verse: refined.verse.trim(),
    category: refined.category.trim(),
    content: refined.content.trim(),
    prayer: refined.prayer?.trim() || extracted.prayer,
    reflectionQuestion:
      refined.reflectionQuestion?.trim() || extracted.reflectionQuestion,
    facebookCopy: refined.facebookCopy?.trim() || existing.facebookCopy,
    contentCharCount: refined.content.trim().length,
    editedByAdmin: true,
    updatedAt: now,
    versionHistory,
    promptVersion: REFINE_PROMPT_VERSION,
    ...(status ? { status } : {}),
    ...(options.updateImageKeywords && refined.imageKeywords?.trim()
      ? { imageKeywords: refined.imageKeywords.trim() }
      : {}),
  };

  return upsertDevotional(updated);
}
