import {
  assembleDevotionalContent,
  limitImageKeywords,
  mapRawGeminiToPlannedDay,
  type RawGeminiPlannedDay,
} from "./planned-day-mapper";
import { repairTruncatedJsonObject } from "./gemini-fetch";
import type { DynamicPlannedDay } from "./types";

const DEFAULT_SCRIPTURE = "Zsoltárok 23:1 — Az Úr az én pásztorom";
const DEFAULT_CATEGORY = "Békesség";
const DEFAULT_PRAYER =
  "Uram, add meg a mai napomhoz a szükséges békét és figyelmességet. Vezess minden lépésemben. Ámen.";
const DEFAULT_QUESTION = "Mire hív meg téged Isten ma ebben a gondolatban?";

function stripFences(text: string): string {
  return text.replace(/```json|```/gi, "").trim();
}

function tryParsePartialJson(raw: string): RawGeminiPlannedDay | null {
  const stripped = stripFences(raw);
  const candidates = [stripped];

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(stripped.slice(start, end + 1));
  }
  candidates.push(repairTruncatedJsonObject(stripped));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as RawGeminiPlannedDay;
    } catch {
      /* next */
    }
  }
  return null;
}

function extractField(raw: string, key: string): string | undefined {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
  const m = raw.match(re);
  if (!m?.[1]) return undefined;
  return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
}

function plainBodyFromText(text: string): string {
  const withoutJson = text
    .replace(/\{[\s\S]*$/, "")
    .replace(/^[\s\S]*?\}/, "")
    .trim();

  const lines = withoutJson
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("{") && !l.startsWith("}"));

  return lines.join("\n\n").slice(0, 2800).trim();
}

function buildMinimalDevotionalMarkdown(body: string): string {
  const trimmed = body.trim();
  if (trimmed.includes("### Elmélkedés")) {
    return trimmed;
  }

  const meditation = trimmed || "Ma csendben állj meg Isten előtt, és engedd, hogy szava formálja a napodat.";
  return [
    "### Elmélkedés",
    "",
    meditation,
    "",
    "### Mai imádság",
    "",
    DEFAULT_PRAYER,
    "",
    "### Gondolatébresztő kérdés",
    "",
    DEFAULT_QUESTION,
  ].join("\n");
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/**
 * Utolsó mentés: részleges JSON vagy plain text → rövid, publikálható áhítat.
 */
export function buildFallbackPlannedDay(
  raw: string,
  expectedDay: number,
  options?: { categoryHint?: string }
): DynamicPlannedDay {
  const partial = tryParsePartialJson(raw);
  if (partial) {
    try {
      return mapRawGeminiToPlannedDay(partial, expectedDay);
    } catch {
      /* plain text fallback below */
    }
  }

  const title =
    extractField(raw, "title") ||
    `A ${expectedDay}. nap áhítata`;
  const scripture =
    extractField(raw, "scripture") ||
    extractField(raw, "verse") ||
    DEFAULT_SCRIPTURE;
  const category =
    extractField(raw, "category") ||
    options?.categoryHint?.trim() ||
    DEFAULT_CATEGORY;
  const excerpt =
    extractField(raw, "excerpt") ||
    truncateWords(plainBodyFromText(raw) || title, 35);
  const devotionalField =
    extractField(raw, "devotional") ||
    extractField(raw, "content") ||
    plainBodyFromText(raw);

  const devotionalBody = buildMinimalDevotionalMarkdown(
    truncateWords(devotionalField, 450)
  );
  const content = assembleDevotionalContent(scripture, devotionalBody);
  const imageKeywords =
    limitImageKeywords(
      extractField(raw, "imageKeywords") || extractField(raw, "image_keywords"),
      4
    ) || "quiet path, soft light, still lake, dawn";

  return {
    dayNumber: expectedDay,
    title,
    verse: scripture,
    content,
    category,
    excerpt,
    facebookCopy: excerpt,
    imageKeywords,
  };
}
