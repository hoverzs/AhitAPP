/** Áhítat törzs — plain markdown (nem JSON), cél: 2000–3000 karakter. */
import {
  parseTolerantDevotionalMarkdown,
  rebuildDevotionalMarkdown,
} from "./devotional-body-parser";
import { deduplicateScripture } from "./scripture-dedup";

export const DEVOTIONAL_MARKDOWN_MAX_CHARS = 3000;

const DEFAULT_PRAYER =
  "Uram, add meg a mai napomhoz a szükséges békét és figyelmességet. Vezess minden lépésemben. Ámen.";
const DEFAULT_QUESTION = "Mire hív meg téged Isten ma ebben a gondolatban?";

export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Biztonságos vágás bekezdéshatárnál — nem dob hibát, ha túl hosszú.
 */
export function truncateDevotionalMarkdown(
  text: string,
  maxChars: number = DEVOTIONAL_MARKDOWN_MAX_CHARS
): { markdown: string; truncated: boolean } {
  const trimmed = stripMarkdownFences(text).trim();
  if (trimmed.length <= maxChars) {
    return { markdown: trimmed, truncated: false };
  }

  const slice = trimmed.slice(0, maxChars);
  const lastBreak = Math.max(
    slice.lastIndexOf("\n\n"),
    slice.lastIndexOf("\n### "),
    slice.lastIndexOf("\n## ")
  );

  if (lastBreak > maxChars * 0.45) {
    return { markdown: slice.slice(0, lastBreak).trim(), truncated: true };
  }

  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.7 ? slice.slice(0, lastSpace) : slice;
  return { markdown: cut.trim(), truncated: true };
}

/**
 * Toleráns parse + kanonikus markdown — garantált nem üres Elmélkedés.
 */
export function normalizeDevotionalMarkdownBody(
  raw: string,
  options?: {
    defaultTitle?: string;
    scriptureFallback?: string;
    /** verse/scripture külön mezőben — ne kerüljön ### Alapige a contentbe */
    omitAlapigeInContent?: boolean;
  }
): string {
  const omitAlapige =
    options?.omitAlapigeInContent ?? Boolean(options?.scriptureFallback?.trim());

  let stripped = stripMarkdownFences(raw).trim();
  if (options?.scriptureFallback?.trim()) {
    stripped = deduplicateScripture(options.scriptureFallback, stripped).markdown;
  }

  if (!stripped) {
    return rebuildDevotionalMarkdown(
      parseTolerantDevotionalMarkdown(DEFAULT_MEDITATION_FALLBACK(), {
        log: true,
      }),
      { scriptureFallback: options?.scriptureFallback }
    );
  }

  const parsed = parseTolerantDevotionalMarkdown(stripped, {
    log: true,
    defaultTitle: options?.defaultTitle,
  });

  if (!parsed.prayer.trim()) {
    parsed.prayer = DEFAULT_PRAYER;
  }
  if (!parsed.question.trim()) {
    parsed.question = DEFAULT_QUESTION;
  }

  return rebuildDevotionalMarkdown(parsed, {
    scriptureFallback: options?.scriptureFallback,
    omitAlapigeInContent: omitAlapige,
  });
}

function DEFAULT_MEDITATION_FALLBACK(): string {
  return "Ma csendben állj meg Isten előtt, és engedd, hogy szava formálja a napodat.";
}
