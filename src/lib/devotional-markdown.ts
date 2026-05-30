/** Áhítat törzs — plain markdown (nem JSON), cél: 2000–3000 karakter. */
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
  const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n### "));

  if (lastBreak > maxChars * 0.45) {
    return { markdown: slice.slice(0, lastBreak).trim(), truncated: true };
  }

  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.7 ? slice.slice(0, lastSpace) : slice;
  return { markdown: cut.trim(), truncated: true };
}

/** Hiányzó szekciók pótlása — stabil megjelenítéshez. */
export function normalizeDevotionalMarkdownBody(raw: string): string {
  let body = stripMarkdownFences(raw).trim();
  if (!body) {
    body = "Ma csendben állj meg Isten előtt, és engedd, hogy szava formálja a napodat.";
  }

  if (!/###\s+Elmélkedés/i.test(body)) {
    body = `### Elmélkedés\n\n${body}`;
  }
  if (!/###\s+Mai imádság/i.test(body)) {
    body = `${body}\n\n### Mai imádság\n\n${DEFAULT_PRAYER}`;
  }
  if (!/gondolat|kérdés/i.test(body)) {
    body = `${body}\n\n### Gondolatébresztő kérdés\n\n${DEFAULT_QUESTION}`;
  }

  return body;
}
