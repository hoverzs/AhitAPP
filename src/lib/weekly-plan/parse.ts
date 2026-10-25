import { limitImageKeywords } from "../planned-day-mapper";
import { WEEKDAY_NAMES_HU } from "./prompts";
import { WEEK_LENGTH } from "./types";

/** Egy nap tervezett tartalma (állapot és dátum nélkül). */
export interface PlanDayDraft {
  title: string;
  verse: string;
  role: string;
  category: string;
  excerpt: string;
  imageKeywords?: string;
}

export interface PlanDraft {
  theme: string;
  arc: string;
  days: PlanDayDraft[];
}

export class PlanParseError extends Error {
  constructor(public readonly problems: string[]) {
    super(`A terv nem dolgozható fel: ${problems.join(" ")}`);
    this.name = "PlanParseError";
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickText(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(obj[key]);
    if (value) return value;
  }
  return "";
}

function stripFences(raw: string): string {
  return raw.replace(/```json|```/gi, "").trim();
}

function extractJsonObject(raw: string): string {
  const stripped = stripFences(raw);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  return start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
}

/** Egyszerű `//` sorkommentek eltávolítása (a minta-formátum tartalmaz ilyet). */
function stripLineComments(json: string): string {
  return json
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

function normalizeDay(raw: unknown): PlanDayDraft {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const keywords = pickText(obj, ["imageKeywords", "image_keywords", "keywords"]);
  return {
    title: pickText(obj, ["title", "cim", "cím"]),
    verse: pickText(obj, ["verse", "scripture", "igehely", "ige"]),
    role: pickText(obj, ["role", "szerep"]),
    category: pickText(obj, ["category", "kategoria", "kategória"]),
    excerpt: pickText(obj, ["excerpt", "kivonat", "facebookCopy"]),
    imageKeywords: limitImageKeywords(keywords) || undefined,
  };
}

function weekdayIndex(value: unknown): number {
  const name = text(value).toLowerCase();
  return WEEKDAY_NAMES_HU.findIndex((w) => w.toLowerCase() === name);
}

/** A napokat hétköznap-név szerint rendezi, ha mind meg van adva; különben marad a sorrend. */
function orderDays(rawDays: unknown[]): unknown[] {
  const indices = rawDays.map((d) =>
    d && typeof d === "object" ? weekdayIndex((d as Record<string, unknown>).weekday) : -1
  );
  const allNamed = indices.every((i) => i >= 0) && new Set(indices).size === rawDays.length;
  if (!allNamed) return rawDays;
  return rawDays
    .map((d, i) => ({ d, k: indices[i] }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.d);
}

/**
 * Gemini (vagy ChatGPT) JSON-ból terv-vázlat. Szigorú: pontosan 7 nap,
 * minden napnak cím és igehely kell.
 */
export function parsePlanJson(raw: string): PlanDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripLineComments(extractJsonObject(raw)));
  } catch (error) {
    throw new PlanParseError([
      `Érvénytelen JSON${error instanceof Error ? `: ${error.message}` : ""}.`,
    ]);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PlanParseError(["A válasz nem JSON objektum."]);
  }
  const obj = parsed as Record<string, unknown>;
  const problems: string[] = [];

  const rawDays = Array.isArray(obj.days) ? obj.days : null;
  if (!rawDays) problems.push('Hiányzik a "days" tömb.');
  else if (rawDays.length !== WEEK_LENGTH) {
    problems.push(`A "days" tömbnek pontosan ${WEEK_LENGTH} eleme kell legyen (most: ${rawDays.length}).`);
  }
  const theme = pickText(obj, ["theme", "tema", "téma"]);
  if (!theme) problems.push("Hiányzik a hét témája (theme).");

  const days = rawDays && rawDays.length === WEEK_LENGTH ? orderDays(rawDays).map(normalizeDay) : [];
  days.forEach((day, i) => {
    if (!day.title) problems.push(`${WEEKDAY_NAMES_HU[i]}: hiányzik a cím (title).`);
    if (!day.verse) problems.push(`${WEEKDAY_NAMES_HU[i]}: hiányzik az igehely (verse).`);
  });
  if (problems.length > 0) throw new PlanParseError(problems);

  return { theme, arc: pickText(obj, ["arc", "iv", "ív"]), days };
}

const LABELS = {
  theme: /^(?:heti\s+)?t[ée]ma\s*[:：]\s*(.+)$/i,
  arc: /^(?:heti\s+)?[ií]v\s*[:：]\s*(.+)$/i,
};

/**
 * Egyszerű, címkézett szöveges formátum:
 *   Téma: …
 *   Ív: …
 *   Hétfő | Cím | Igehely — szöveg | Szerep | Kategória | Kulcsszavak | Kivonat
 * (a szerep és az utána következő mezők elhagyhatók)
 */
function parseLabeledBrief(input: string): PlanDraft {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
  let theme = "";
  let arc = "";
  const byDay = new Map<number, PlanDayDraft>();

  for (const line of lines) {
    const themeMatch = LABELS.theme.exec(line);
    if (themeMatch) {
      theme = themeMatch[1].trim();
      continue;
    }
    const arcMatch = LABELS.arc.exec(line);
    if (arcMatch) {
      arc = arcMatch[1].trim();
      continue;
    }
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    const idx = weekdayIndex(cells[0]);
    if (idx < 0) continue;
    const [, title, verse, role = "", category = "", keywords = "", excerpt = ""] = cells;
    byDay.set(idx, {
      title,
      verse,
      role,
      category,
      excerpt,
      imageKeywords: limitImageKeywords(keywords) || undefined,
    });
  }

  const problems: string[] = [];
  if (!theme) problems.push("Hiányzik a „Téma:” sor.");
  const days: PlanDayDraft[] = [];
  for (let i = 0; i < WEEK_LENGTH; i++) {
    const day = byDay.get(i);
    if (!day) problems.push(`${WEEKDAY_NAMES_HU[i]}: nincs sor.`);
    else {
      if (!day.title) problems.push(`${WEEKDAY_NAMES_HU[i]}: hiányzik a cím.`);
      if (!day.verse) problems.push(`${WEEKDAY_NAMES_HU[i]}: hiányzik az igehely.`);
      days.push(day);
    }
  }
  if (problems.length > 0) throw new PlanParseError(problems);
  return { theme, arc, days };
}

/**
 * Szerkesztői brief közvetlen betöltése (Gemini nélkül). JSON vagy címkézett
 * szöveg; ha egyik sem illik, PlanParseError a hiányokkal.
 */
export function parseStructuredBrief(input: string): PlanDraft {
  const trimmed = input.trim();
  if (!trimmed) throw new PlanParseError(["A brief üres."]);
  const looksJson = trimmed.includes("{") && /"days"\s*:/.test(trimmed);
  if (looksJson) return parsePlanJson(trimmed);
  return parseLabeledBrief(trimmed);
}
