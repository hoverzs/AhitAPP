import {
  normalizeDevotionalMarkdownBody,
  truncateDevotionalMarkdown,
} from "./devotional-markdown";
import { parseImageKeywordTags } from "./image-keywords";
import type { DynamicPlannedDay } from "./types";
export interface DevotionalMetadata {
  title: string;
  scripture: string;
  category: string;
  excerpt: string;
  imageKeywords?: string;
}

export interface RawDevotionalMetadata {
  title?: string;
  scripture?: string;
  verse?: string;
  category?: string;
  excerpt?: string;
  imageKeywords?: string;
  image_keywords?: string;
}

/** Összeállított generálás — kód építi össze. */
export interface DevotionalGenerationParts {
  title: string;
  scripture: string;
  category: string;
  excerpt: string;
  devotionalMarkdown: string;
  imageKeywords?: string;
}

export function limitImageKeywords(raw: string | undefined, max = 4): string | undefined {
  if (!raw?.trim()) return undefined;
  const tags = parseImageKeywordTags(raw);
  if (tags.length === 0) return undefined;
  return tags.slice(0, max).join(", ");
}

export function parseMetadataJson(raw: string): DevotionalMetadata {
  const stripped = raw.replace(/```json|```/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  const candidate =
    start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;

  let parsed: RawDevotionalMetadata;
  try {
    parsed = JSON.parse(candidate) as RawDevotionalMetadata;
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Metadata JSON hiba: ${e.message}`
        : "Metadata JSON érvénytelen."
    );
  }

  const title = parsed.title?.trim() || "";
  const scripture = parsed.scripture?.trim() || parsed.verse?.trim() || "";
  const category = parsed.category?.trim() || "";
  const excerpt = parsed.excerpt?.trim() || "";

  if (!title || !scripture || !category) {
    throw new Error("Hiányzó metadata mezők (title, scripture, category).");
  }

  return {
    title,
    scripture,
    category,
    excerpt: excerpt || title,
    imageKeywords:
      limitImageKeywords(
        parsed.imageKeywords?.trim() || parsed.image_keywords?.trim()
      ) || undefined,
  };
}

/** scripture + markdown törzs → teljes content (toleráns parse). */
export function assembleDevotionalContent(
  scripture: string,
  devotionalMarkdown: string
): string {
  return normalizeDevotionalMarkdownBody(devotionalMarkdown, {
    scriptureFallback: scripture,
  });
}

export function assemblePlannedDayFromParts(
  parts: DevotionalGenerationParts,
  expectedDay: number
): DynamicPlannedDay {
  const { markdown, truncated } = truncateDevotionalMarkdown(parts.devotionalMarkdown);
  if (truncated) {
    console.info(
      `[assemblePlannedDayFromParts] Markdown truncated to fit ${markdown.length} chars`
    );
  }
  const normalizedMarkdown = normalizeDevotionalMarkdownBody(markdown);
  const content = assembleDevotionalContent(parts.scripture, normalizedMarkdown);
  const excerpt = parts.excerpt.trim() || parts.title;

  return {
    dayNumber: expectedDay,
    title: parts.title.trim(),
    verse: parts.scripture.trim(),
    content,
    category: parts.category.trim(),
    excerpt,
    facebookCopy: excerpt,
    imageKeywords: limitImageKeywords(parts.imageKeywords) || parts.imageKeywords,
  };
}

/** @deprecated Egylépcsős JSON — visszafelé kompatibilitás. */
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

  return assemblePlannedDayFromParts(
    {
      title,
      scripture,
      category,
      excerpt: parsed.excerpt?.trim() || title,
      devotionalMarkdown: devotionalBody,
      imageKeywords:
        limitImageKeywords(
          parsed.imageKeywords?.trim() || parsed.image_keywords?.trim()
        ) || undefined,
    },
    expectedDay
  );
}
