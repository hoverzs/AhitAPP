const DEFAULT_SUGGESTIONS = [
  "quiet path",
  "golden hour",
  "misty forest",
  "still lake",
  "soft light",
  "peaceful dawn",
];

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  békesség: ["still water", "calm lake", "soft morning light"],
  hit: ["sunrise path", "open horizon", "golden light"],
  remény: ["dawn sky", "light through trees", "new morning"],
  bizalom: ["steady path", "quiet forest", "gentle hills"],
  hálá: ["warm light", "meadow flowers", "peaceful field"],
  imádság: ["quiet chapel light", "candle glow", "serene nature"],
  önreflexió: ["misty lake", "reflection water", "solitary path"],
};

/** Gemini imageKeywords → kattintható tagek. */
export function parseImageKeywordTags(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];

  const parts = raw
    .split(/[,;|/]+|\n/)
    .flatMap((chunk) => chunk.split(/\s{2,}/))
    .map((s) => s.replace(/^[\[\("']+|[\]\)"']+$/g, "").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(part);
    }
  }

  return tags.slice(0, 5);
}

export function suggestedKeywordTags(
  imageKeywords: string | undefined,
  category?: string
): string[] {
  const fromGemini = parseImageKeywordTags(imageKeywords);
  if (fromGemini.length > 0) return fromGemini;

  const catKey = category?.trim().toLowerCase() ?? "";
  const fromCategory = CATEGORY_SUGGESTIONS[catKey];
  if (fromCategory?.length) return fromCategory;

  return DEFAULT_SUGGESTIONS;
}

export function appendKeywordToQuery(current: string, tag: string): string {
  const trimmed = current.trim();
  const tagLower = tag.toLowerCase();

  if (!trimmed) return tag;
  if (trimmed.toLowerCase().includes(tagLower)) return trimmed;
  return `${trimmed}, ${tag}`;
}
