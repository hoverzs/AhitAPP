import type { Devotional } from "./types";

export interface HistoricalDayEntry {
  dayNumber: number;
  title: string;
  verseReference: string;
  category: string;
  createdAt: string;
}

export interface DevotionalMemory {
  totalPublished: number;
  maxDayNumber: number;
  nextDayNumber: number;
  usedVerseReferences: string[];
  usedTitles: string[];
  usedCategories: string[];
  recentDays: HistoricalDayEntry[];
  summaryForPrompt: string;
}

/** Igehely kinyerése a verse mezőből (pl. "Róma 12:1-2 — szöveg"). */
export function extractVerseReference(verse: string): string {
  const trimmed = verse.trim();
  const dashSplit = trimmed.split(/\s*[—–-]\s+/);
  if (dashSplit.length > 1 && dashSplit[0].length < 80) {
    return dashSplit[0].trim();
  }
  const paren = trimmed.match(/^(.+?\d+:\d+(?:-\d+)?)/);
  if (paren) return paren[1].trim();
  return trimmed.slice(0, 60);
}

export function normalizeReference(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .trim();
}

export interface VerseReferenceMatch {
  reference: string;
  normalized: string;
}

export function findVerseReferenceMatch(
  candidate: string,
  usedReferences: string[]
): VerseReferenceMatch | undefined {
  const norm = normalizeReference(candidate);
  return usedReferences
    .map((reference) => ({
      reference,
      normalized: normalizeReference(reference),
    }))
    .find((stored) => stored.normalized === norm);
}

export function isVerseReferenceUsed(
  candidate: string,
  usedReferences: string[]
): boolean {
  return Boolean(findVerseReferenceMatch(candidate, usedReferences));
}

/** A tároló rekordokon túli előzménye (Blob meta.json) — a törölt napok emlékezete. */
export interface StoredMemoryMeta {
  maxDayNumber: number;
  usedVerseReferences: string[];
  usedTitles: string[];
  usedCategories: string[];
  recentDays?: HistoricalDayEntry[];
}

const RECENT_DAYS_LIMIT = 21;

function unionKeepingOrder(stored: string[], current: string[]): string[] {
  const seen = new Set(stored);
  return [...stored, ...current.filter((c) => !seen.has(c))];
}

/**
 * A rekordokból épített memóriát kiegészíti a tárolt előzménnyel, hogy a már
 * törölt napok igehelyei, címei és kategóriái továbbra is számítsanak az
 * ismétlés-védelemben. A nextDayNumber (generálási cél) változatlan marad.
 */
export function mergeStoredMetaIntoMemory(
  memory: DevotionalMemory,
  meta: StoredMemoryMeta | null | undefined
): DevotionalMemory {
  if (!meta) return memory;

  const usedVerseReferences = unionKeepingOrder(
    meta.usedVerseReferences,
    memory.usedVerseReferences
  );
  const usedTitles = unionKeepingOrder(meta.usedTitles, memory.usedTitles);
  const usedCategories = unionKeepingOrder(meta.usedCategories, memory.usedCategories);

  const byDay = new Map<number, HistoricalDayEntry>();
  for (const d of meta.recentDays ?? []) byDay.set(d.dayNumber, d);
  for (const d of memory.recentDays) byDay.set(d.dayNumber, d);
  const recentDays = [...byDay.values()]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .slice(-RECENT_DAYS_LIMIT);

  const maxDayNumber = Math.max(memory.maxDayNumber, meta.maxDayNumber);

  const summary = {
    totalPublished: memory.totalPublished,
    maxDayNumber,
    nextDayNumber: memory.nextDayNumber,
    usedTitles,
    usedCategories,
    recentDays,
    thematicHint:
      usedCategories.length > 0
        ? `Legutóbbi kategóriák: ${usedCategories.slice(-5).join(", ")}`
        : "Még nincs korábbi kategória — kezdd egy erős bevezető héttémával (pl. Önreflexió).",
  };

  return {
    ...memory,
    maxDayNumber,
    usedVerseReferences,
    usedTitles,
    usedCategories,
    recentDays,
    summaryForPrompt: JSON.stringify(summary, null, 2),
  };
}

export function buildDevotionalMemory(
  devotionals: Devotional[],
  options?: { nextDayNumber?: number }
): DevotionalMemory {
  const sorted = [...devotionals].sort((a, b) => a.dayNumber - b.dayNumber);
  const maxDayNumber =
    sorted.length > 0 ? Math.max(...sorted.map((d) => d.dayNumber)) : 0;
  const nextDayNumber = options?.nextDayNumber ?? maxDayNumber + 1;

  const recentDays: HistoricalDayEntry[] = sorted.slice(-21).map((d) => ({
    dayNumber: d.dayNumber,
    title: d.title,
    verseReference: extractVerseReference(d.verse),
    category: d.category ?? "—",
    createdAt: d.createdAt,
  }));

  const usedVerseReferences = [
    ...new Set(sorted.map((d) => extractVerseReference(d.verse))),
  ];
  const usedTitles = [...new Set(sorted.map((d) => d.title))];
  const usedCategories = [
    ...new Set(
      sorted.map((d) => d.category).filter((c): c is string => Boolean(c?.trim()))
    ),
  ];

  const historical_data_summary = {
    totalPublished: sorted.length,
    maxDayNumber,
    nextDayNumber,
    usedTitles,
    usedCategories,
    recentDays,
    thematicHint:
      usedCategories.length > 0
        ? `Legutóbbi kategóriák: ${usedCategories.slice(-5).join(", ")}`
        : "Még nincs korábbi kategória — kezdd egy erős bevezető héttémával (pl. Önreflexió).",
  };

  return {
    totalPublished: sorted.length,
    maxDayNumber,
    nextDayNumber,
    usedVerseReferences,
    usedTitles,
    usedCategories,
    recentDays,
    summaryForPrompt: JSON.stringify(historical_data_summary, null, 2),
  };
}
