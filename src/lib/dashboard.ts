import type { Devotional } from "./types";

export function getLatestDevotional(
  devotionals: Devotional[]
): Devotional | null {
  if (devotionals.length === 0) return null;
  return [...devotionals].sort((a, b) => b.dayNumber - a.dayNumber)[0];
}

export function getRecentDevotionals(
  devotionals: Devotional[],
  limit = 3
): Devotional[] {
  return [...devotionals]
    .sort((a, b) => b.dayNumber - a.dayNumber)
    .slice(0, limit);
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("hu-HU", {
    month: "long",
    day: "numeric",
  });
}
