import type { Devotional } from "./types";
import { getBudapestDateIso } from "./timezone";

export function getLatestDevotional(
  devotionals: Devotional[]
): Devotional | null {
  if (devotionals.length === 0) return null;

  const today = getBudapestDateIso();
  const forToday = devotionals.find(
    (d) => (d.date ?? d.createdAt.slice(0, 10)) === today
  );
  if (forToday) return forToday;

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
