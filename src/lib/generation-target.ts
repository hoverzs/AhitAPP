import {
  isApprovedOrPublished,
  isPendingReview,
  normalizeDevotional,
  normalizeDevotionalStatus,
} from "./devotional-status";
import { DEV_REVIEW_MODE } from "./dev-review";
import { getAppTodayIso } from "./app-date";
import { devotionalDateKey } from "./storage/devotional-validate";
import type { Devotional } from "./types";

export type GenerationAction = "create" | "update" | "skip" | "blocked";

/** A generálás célja: egy naptári nap (nincs napszámozás). */
export interface GenerationTarget {
  action: GenerationAction;
  /** A generálandó nap (YYYY-MM-DD). */
  date: string;
  existing?: Devotional;
  blockedReason?: string;
  skipReason?: string;
}

/** Mai nap — re-export a kanonikus app-date modulból. */
export function getTodayDateIso(): string {
  return getAppTodayIso();
}

export function getDevotionalByDate(
  devotionals: Devotional[],
  date: string
): Devotional | undefined {
  return devotionals.find((d) => devotionalDateKey(d) === date);
}

function newestFirst(devotionals: Devotional[]): Devotional[] {
  return [...devotionals].sort((a, b) =>
    devotionalDateKey(b).localeCompare(devotionalDateKey(a))
  );
}

function updateTarget(existing: Devotional): GenerationTarget {
  return { action: "update", date: devotionalDateKey(existing), existing };
}

export function resolveManualGenerationTarget(
  devotionals: Devotional[]
): GenerationTarget {
  const all = devotionals.map(normalizeDevotional);
  const today = getTodayDateIso();

  if (!DEV_REVIEW_MODE) {
    const forToday = getDevotionalByDate(all, today);
    return forToday ? updateTarget(forToday) : { action: "create", date: today };
  }

  const pending = newestFirst(all).find((d) =>
    isPendingReview(normalizeDevotionalStatus(d.status))
  );
  if (pending) return updateTarget(pending);

  const latest = newestFirst(all)[0];

  if (latest && !isApprovedOrPublished(normalizeDevotionalStatus(latest.status))) {
    return {
      action: "blocked",
      date: devotionalDateKey(latest),
      existing: latest,
      blockedReason:
        "A mai áhítat még nincs jóváhagyva. Fejlesztői módban nem generálunk további napokat.",
    };
  }

  const forToday = getDevotionalByDate(all, today);
  return forToday ? updateTarget(forToday) : { action: "create", date: today };
}

export function resolveAutoGenerationTarget(
  devotionals: Devotional[],
  date: string = getTodayDateIso()
): GenerationTarget {
  const all = devotionals.map(normalizeDevotional);
  const existing = getDevotionalByDate(all, date);

  if (existing) {
    return {
      action: "skip",
      date: devotionalDateKey(existing),
      existing,
      skipReason: existing.editedByAdmin
        ? "Admin által szerkesztett tartalom — automatikus generálás kihagyva."
        : "Már van áhítat erre a napra.",
    };
  }

  if (DEV_REVIEW_MODE) {
    const manual = resolveManualGenerationTarget(all);
    if (manual.action === "blocked") return manual;
    if (manual.action === "update" && manual.existing && devotionalDateKey(manual.existing) === date) {
      return {
        action: "skip",
        date: manual.date,
        existing: manual.existing,
        skipReason: "Fejlesztői módban a mai áhítat már létezik (újragenerálás: admin gomb).",
      };
    }
    return { action: "create", date: manual.date };
  }

  return { action: "create", date };
}

export function resolveRegenerateTarget(
  devotionals: Devotional[],
  date: string
): GenerationTarget {
  const all = devotionals.map(normalizeDevotional);
  const existing = getDevotionalByDate(all, date);

  if (!existing) {
    throw new Error(`A(z) ${date} napi áhítat nem található.`);
  }

  return updateTarget(existing);
}

export function resolveGenerationTarget(
  devotionals: Devotional[]
): GenerationTarget {
  return resolveManualGenerationTarget(devotionals);
}

export function canAdvanceToNextDay(devotionals: Devotional[]): boolean {
  if (!DEV_REVIEW_MODE) return true;
  return !devotionals.map(normalizeDevotional).some((d) => isPendingReview(d.status));
}
