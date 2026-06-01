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

function normalizeReference(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .trim();
}

export function isVerseReferenceUsed(
  candidate: string,
  usedReferences: string[]
): boolean {
  const norm = normalizeReference(candidate);
  return usedReferences.some((u) => normalizeReference(u) === norm);
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
