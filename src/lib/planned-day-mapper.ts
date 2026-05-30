import { formatVerseAsBlockquote } from "./devotional-sections";
import { parseImageKeywordTags } from "./image-keywords";
import type { DynamicPlannedDay } from "./types";

/** Nyers Gemini JSON — minimális séma + visszafelé kompatibilitás. */
export interface RawGeminiPlannedDay {
  title?: string;
  scripture?: string;
  verse?: string;
  category?: string;
  excerpt?: string;
  devotional?: string;
  content?: string;
  imageKeywords?: string;
  image_keywords?: string;
  dayNumber?: number;
  facebookCopy?: string;
}

export function limitImageKeywords(raw: string | undefined, max = 5): string | undefined {
  if (!raw?.trim()) return undefined;
  const tags = parseImageKeywordTags(raw);
  if (tags.length === 0) return undefined;
  return tags.slice(0, max).join(", ");
}

function extractVerseText(scripture: string): string {
  const trimmed = scripture.trim();
  const dashSplit = trimmed.split(/\s*[—–-]\s+/);
  if (dashSplit.length >= 2) {
    return dashSplit.slice(1).join(" — ").trim();
  }
  return trimmed;
}

function extractVerseReference(scripture: string): string {
  const trimmed = scripture.trim();
  const dashSplit = trimmed.split(/\s*[—–-]\s+/);
  if (dashSplit.length >= 2) {
    return dashSplit[0].trim();
  }
  return trimmed;
}

/** scripture + devotional → teljes markdown content (Alapige + szekciók). */
export function assembleDevotionalContent(scripture: string, devotional: string): string {
  const quote = extractVerseText(scripture);
  const reference = extractVerseReference(scripture);
  const alapigeBody = formatVerseAsBlockquote(quote || reference);
  const alapige = `### Alapige\n\n${alapigeBody}`;

  const body = devotional.trim();
  const sections = body.startsWith("###") ? body : `### Elmélkedés\n\n${body}`;

  return `${alapige}\n\n${sections}`;
}

/**
 * Nyers Gemini válasz → belső DynamicPlannedDay (dayNumber a hívó adja).
 */
export function mapRawGeminiToPlannedDay(
  parsed: RawGeminiPlannedDay,
  expectedDay: number
): DynamicPlannedDay {
  const scripture = parsed.scripture?.trim() || parsed.verse?.trim() || "";
  const devotionalBody = parsed.devotional?.trim() || parsed.content?.trim() || "";
  const title = parsed.title?.trim() || "";
  const category = parsed.category?.trim() || "";

  if (!title || !scripture || !devotionalBody || !category) {
    throw new Error(
      "Hiányzó mezők a Gemini válaszában (title, scripture, devotional, category)."
    );
  }

  const content = assembleDevotionalContent(scripture, devotionalBody);
  const excerpt = parsed.excerpt?.trim();
  const imageKeywords =
    limitImageKeywords(parsed.imageKeywords?.trim() || parsed.image_keywords?.trim()) ||
    undefined;

  return {
    dayNumber: expectedDay,
    title,
    verse: scripture,
    content,
    category,
    excerpt,
    facebookCopy: excerpt || parsed.facebookCopy?.trim() || undefined,
    imageKeywords,
  };
}
