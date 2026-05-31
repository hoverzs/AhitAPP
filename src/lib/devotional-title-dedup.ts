/** Cím összehasonlításhoz — formázás nélkül. */
export function normalizeComparableTitle(text: string): string {
  return text
    .replace(/^#+\s*/, "")
    .replace(/^\*\*([\s\S]+)\*\*$/, "$1")
    .replace(/^>\s?/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Eltávolítja a markdownból azokat a bekezdéseket, amelyek megegyeznek
 * a már megjelenített áhítat címével (pl. ige alatti ismétlés).
 */
export function stripDuplicateDevotionalTitle(
  content: string,
  title?: string
): string {
  if (!title?.trim() || !content.trim()) return content.trim();

  const normTitle = normalizeComparableTitle(title);
  if (!normTitle) return content.trim();

  const blocks = content.split(/\n\n+/).filter(Boolean);
  const kept = blocks.filter((block) => {
    const plainLines = block
      .split("\n")
      .map((line) =>
        line
          .replace(/^>\s?/, "")
          .replace(/^#+\s*/, "")
          .replace(/\*\*/g, "")
          .trim()
      )
      .filter(Boolean);

    if (plainLines.length === 0) return false;

    const blockNorm = normalizeComparableTitle(plainLines.join(" "));
    if (blockNorm === normTitle) return false;

    if (plainLines.length === 1 && normalizeComparableTitle(plainLines[0]) === normTitle) {
      return false;
    }

    return true;
  });

  return kept.join("\n\n").trim();
}
