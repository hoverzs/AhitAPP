import { devotionalDateKey } from "./storage/devotional-validate";
import type { Devotional } from "./types";

/** Egy korábbi nap rövid emléke — dátum szerint azonosítva (nincs napszámozás). */
export interface HistoricalDayEntry {
  date: string;
  title: string;
  verseReference: string;
  category: string;
}

export interface DevotionalMemory {
  totalPublished: number;
  /** A generálandó nap dátuma (YYYY-MM-DD). */
  targetDate: string;
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

function summaryFor(memory: Omit<DevotionalMemory, "summaryForPrompt">): string {
  return JSON.stringify(
    {
      totalPublished: memory.totalPublished,
      targetDate: memory.targetDate,
      usedTitles: memory.usedTitles,
      usedCategories: memory.usedCategories,
      recentDays: memory.recentDays,
      thematicHint:
        memory.usedCategories.length > 0
          ? `Legutóbbi kategóriák: ${memory.usedCategories.slice(-5).join(", ")}`
          : "Még nincs korábbi kategória — kezdd egy erős bevezető héttémával (pl. Önreflexió).",
    },
    null,
    2
  );
}

/**
 * A rekordokból épített memóriát kiegészíti a tárolt előzménnyel, hogy a már
 * törölt napok igehelyei, címei és kategóriái továbbra is számítsanak az
 * ismétlés-védelemben. A célnap (targetDate) változatlan marad.
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

  const byDate = new Map<string, HistoricalDayEntry>();
  for (const d of meta.recentDays ?? []) byDate.set(d.date, d);
  for (const d of memory.recentDays) byDate.set(d.date, d);
  const recentDays = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-RECENT_DAYS_LIMIT);

  const merged = {
    totalPublished: memory.totalPublished,
    targetDate: memory.targetDate,
    usedVerseReferences,
    usedTitles,
    usedCategories,
    recentDays,
  };
  return { ...merged, summaryForPrompt: summaryFor(merged) };
}

export function buildDevotionalMemory(
  devotionals: Devotional[],
  options: { targetDate: string }
): DevotionalMemory {
  const sorted = [...devotionals].sort((a, b) =>
    devotionalDateKey(a).localeCompare(devotionalDateKey(b))
  );

  const recentDays: HistoricalDayEntry[] = sorted.slice(-RECENT_DAYS_LIMIT).map((d) => ({
    date: devotionalDateKey(d),
    title: d.title,
    verseReference: extractVerseReference(d.verse),
    category: d.category ?? "—",
  }));

  const base = {
    totalPublished: sorted.length,
    targetDate: options.targetDate,
    usedVerseReferences: [...new Set(sorted.map((d) => extractVerseReference(d.verse)))],
    usedTitles: [...new Set(sorted.map((d) => d.title))],
    usedCategories: [
      ...new Set(
        sorted.map((d) => d.category).filter((c): c is string => Boolean(c?.trim()))
      ),
    ],
    recentDays,
  };

  return { ...base, summaryForPrompt: summaryFor(base) };
}
