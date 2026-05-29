import { promises as fs } from "fs";
import path from "path";
import type {
  GeminiReadingPlanResponse,
  ReadingPlan,
  ReadingPlanDay,
} from "./reading-plan-types";

const PLAN_PATH = path.join(process.cwd(), "src", "config", "readingPlan.json");

function isValidDay(d: unknown): d is ReadingPlanDay {
  if (!d || typeof d !== "object") return false;
  const o = d as ReadingPlanDay;
  return (
    typeof o.dayNumber === "number" &&
    o.dayNumber >= 1 &&
    o.dayNumber <= 30 &&
    typeof o.verseReference === "string" &&
    typeof o.themeCategory === "string" &&
    typeof o.verseText === "string" &&
    typeof o.imagePromptSubject === "string" &&
    typeof o.weekNumber === "number" &&
    typeof o.weekTheme === "string"
  );
}

/** Csak a `generate:reading-plan` scripthez — runtime UI nem hívja. */
export async function readReadingPlan(): Promise<ReadingPlan> {
  const raw = await fs.readFile(PLAN_PATH, "utf-8");
  const parsed = JSON.parse(raw) as ReadingPlan;

  if (!parsed?.days?.length) {
    throw new Error("Az olvasási terv üres vagy hiányzik.");
  }

  const days = parsed.days.filter(isValidDay).sort((a, b) => a.dayNumber - b.dayNumber);
  if (days.length !== 30) {
    throw new Error(
      `Az olvasási tervnek pontosan 30 napnak kell lennie (jelenleg: ${days.length}).`
    );
  }

  return { ...parsed, days };
}

export function getReadingDayByNumber(
  plan: ReadingPlan,
  dayNumber: number
): ReadingPlanDay | undefined {
  return plan.days.find((d) => d.dayNumber === dayNumber);
}

export function getNextReadingDay(
  plan: ReadingPlan,
  existingDayNumbers: number[]
): ReadingPlanDay | null {
  const next = plan.days.find((d) => !existingDayNumbers.includes(d.dayNumber));
  return next ?? null;
}

export function normalizeGeminiPlan(response: GeminiReadingPlanResponse): ReadingPlan {
  const days: ReadingPlanDay[] = [];

  for (const week of response.weeks) {
    for (const day of week.days) {
      days.push({
        dayNumber: day.dayNumber,
        verseReference: day.verseReference.trim(),
        themeCategory: day.themeCategory.trim(),
        verseText: day.verseText.trim(),
        imagePromptSubject: day.imagePromptSubject.trim(),
        weekNumber: week.weekNumber,
        weekTheme: week.theme.trim(),
      });
    }
  }

  days.sort((a, b) => a.dayNumber - b.dayNumber);

  const refs = days.map((d) => d.verseReference.toLowerCase());
  if (new Set(refs).size !== refs.length) {
    throw new Error("Ismétlődő verseReference található a generált tervben.");
  }

  if (days.length !== 30) {
    throw new Error(`A generált terv ${days.length} napot tartalmaz, 30 helyett.`);
  }

  for (let i = 1; i <= 30; i++) {
    if (!days.some((d) => d.dayNumber === i)) {
      throw new Error(`Hiányzik a ${i}. nap a generált tervből.`);
    }
  }

  const weeks = response.weeks.map((w) => ({
    weekNumber: w.weekNumber,
    theme: w.theme,
    themeEn: w.themeEn,
    days: w.days.map((d) => ({
      dayNumber: d.dayNumber,
      verseReference: d.verseReference,
      themeCategory: d.themeCategory,
    })),
  }));

  return {
    title: response.title || "30 napos áhítatos olvasási terv",
    generatedAt: new Date().toISOString(),
    weeks,
    days,
  };
}

export function getReadingPlanPath(): string {
  return PLAN_PATH;
}
