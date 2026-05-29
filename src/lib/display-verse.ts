import type { Devotional } from "./types";
import { extractVerseReference } from "./devotional-memory";
import { STATIC_DISPLAY_VERSE } from "./fallbacks";

export interface DisplayVerse {
  reference: string;
  text: string;
  themeCategory: string;
}

function extractVerseText(verse: string): string {
  const parts = verse.split(/\s*[—–-]\s+/);
  if (parts.length > 1) {
    return parts.slice(1).join(" — ").trim();
  }
  return verse.trim();
}

export function devotionalToDisplayVerse(d: Devotional): DisplayVerse {
  return {
    reference: extractVerseReference(d.verse),
    text: extractVerseText(d.verse),
    themeCategory: d.category?.trim() || "Áhítat",
  };
}

/** Megjelenítéshez: közzétett nap → legutóbbi → statikus tartalék. */
export function resolveDisplayVerse(
  devotionals: Devotional[],
  preferredDayNumber?: number
): DisplayVerse {
  if (preferredDayNumber) {
    const exact = devotionals.find((d) => d.dayNumber === preferredDayNumber);
    if (exact) return devotionalToDisplayVerse(exact);
  }

  if (devotionals.length > 0) {
    const latest = [...devotionals].sort((a, b) => b.dayNumber - a.dayNumber)[0];
    return devotionalToDisplayVerse(latest);
  }

  return { ...STATIC_DISPLAY_VERSE };
}
