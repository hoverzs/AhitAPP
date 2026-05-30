import {
  isApprovedOrPublished,
  isPendingReview,
  normalizeDevotional,
} from "./devotional-status";
import { DEV_REVIEW_MODE } from "./dev-review";
import type { Devotional } from "./types";
import { getBudapestDateIso } from "./timezone";

export type GenerationAction = "create" | "update" | "skip" | "blocked";

export interface GenerationTarget {
  action: GenerationAction;
  dayNumber: number;
  date: string;
  existing?: Devotional;
  blockedReason?: string;
  skipReason?: string;
}

export function getTodayDateIso(): string {
  return getBudapestDateIso();
}

export function getDevotionalByDate(
  devotionals: Devotional[],
  date: string
): Devotional | undefined {
  return devotionals.find((d) => (d.date ?? d.createdAt.slice(0, 10)) === date);
}

function nextSerialDayNumber(all: Devotional[]): number {
  if (all.length === 0) return 1;
  return Math.max(...all.map((d) => d.dayNumber)) + 1;
}

export function resolveManualGenerationTarget(
  devotionals: Devotional[]
): GenerationTarget {
  const all = devotionals.map(normalizeDevotional);
  const today = getTodayDateIso();

  if (!DEV_REVIEW_MODE) {
    const forToday = getDevotionalByDate(all, today);
    if (forToday) {
      return {
        action: "update",
        dayNumber: forToday.dayNumber,
        date: forToday.date,
        existing: forToday,
      };
    }
    return {
      action: "create",
      dayNumber: nextSerialDayNumber(all),
      date: today,
    };
  }

  const pending = all
    .filter((d) => isPendingReview(d.status))
    .sort((a, b) => b.dayNumber - a.dayNumber)[0];

  if (pending) {
    return {
      action: "update",
      dayNumber: pending.dayNumber,
      date: pending.date,
      existing: pending,
    };
  }

  const latest = [...all].sort((a, b) => b.dayNumber - a.dayNumber)[0];

  if (latest && !isApprovedOrPublished(latest.status)) {
    return {
      action: "blocked",
      dayNumber: latest.dayNumber,
      date: latest.date,
      existing: latest,
      blockedReason:
        "A mai áhítat még nincs jóváhagyva. Fejlesztői módban nem generálunk további napokat.",
    };
  }

  const forToday = getDevotionalByDate(all, today);
  if (forToday) {
    return {
      action: "update",
      dayNumber: forToday.dayNumber,
      date: forToday.date,
      existing: forToday,
    };
  }

  return {
    action: "create",
    dayNumber: latest ? latest.dayNumber + 1 : 1,
    date: today,
  };
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
      dayNumber: existing.dayNumber,
      date: existing.date,
      existing,
      skipReason: existing.editedByAdmin
        ? "Admin által szerkesztett tartalom — automatikus generálás kihagyva."
        : "Már van áhítat erre a napra.",
    };
  }

  if (DEV_REVIEW_MODE) {
    const manual = resolveManualGenerationTarget(all);
    if (manual.action === "blocked") return manual;
    if (manual.action === "update" && manual.existing?.date === date) {
      return {
        action: "skip",
        dayNumber: manual.dayNumber,
        date: manual.date,
        existing: manual.existing,
        skipReason: "Fejlesztői módban a mai áhítat már létezik (újragenerálás: admin gomb).",
      };
    }
    return {
      action: "create",
      dayNumber: manual.dayNumber,
      date: manual.date,
    };
  }

  return {
    action: "create",
    dayNumber: nextSerialDayNumber(all),
    date,
  };
}

export function resolveRegenerateTarget(
  devotionals: Devotional[],
  dayNumber: number
): GenerationTarget {
  const all = devotionals.map(normalizeDevotional);
  const existing = all.find((d) => d.dayNumber === dayNumber);

  if (!existing) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  return {
    action: "update",
    dayNumber: existing.dayNumber,
    date: existing.date,
    existing,
  };
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
