import type { Devotional } from "./types";
import { APP_TIMEZONE, getAppTodayIso } from "./app-date";

export function getLatestDevotional(
  devotionals: Devotional[]
): Devotional | null {
  if (devotionals.length === 0) return null;

  const today = getAppTodayIso();
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
    .sort((a, b) => {
      const da = a.date ?? a.createdAt.slice(0, 10);
      const db = b.date ?? b.createdAt.slice(0, 10);
      if (da !== db) return db.localeCompare(da);
      return b.dayNumber - a.dayNumber;
    })
    .slice(0, limit);
}

export function formatShortDate(iso: string): string {
  const dateOnly = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const d = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("hu-HU", {
    timeZone: APP_TIMEZONE,
    month: "long",
    day: "numeric",
  });
}
