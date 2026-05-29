import { parseDevotionalSections } from "./devotional-sections";

const MEDITATION_IDS = new Set(["elmélkedes", "parhuzam", "kifejtes", "egyeb"]);

/** Az elmélkedés első N bekezdése markdown formában (főoldali előnézethez). */
export function extractDevotionalExcerpt(
  content: string,
  maxParagraphs = 3
): string {
  const sections = parseDevotionalSections(content, {
    prependVerseAsAlapige: false,
  });

  const body = sections
    .filter((s) => MEDITATION_IDS.has(s.id))
    .map((s) => s.body)
    .join("\n\n")
    .trim();

  const source = body || content;

  const paragraphs = source
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 24 &&
        !p.startsWith("###") &&
        !/^🕊/.test(p) &&
        !/^>\s/.test(p)
    );

  if (paragraphs.length > 0) {
    return paragraphs.slice(0, maxParagraphs).join("\n\n");
  }

  const fallback = source.replace(/^#+\s.+$/gm, "").trim();
  const plain = fallback.replace(/\s+/g, " ").trim();
  if (plain.length <= 480) return plain;
  return `${plain.slice(0, 480).trim()}…`;
}

export function parseVerseDisplay(verse: string): {
  reference: string;
  text: string;
} {
  const dash = verse.indexOf("—");
  if (dash === -1) {
    return { reference: "", text: verse.trim() };
  }
  return {
    reference: verse.slice(0, dash).trim(),
    text: verse.slice(dash + 1).trim(),
  };
}

export function formatDevotionalDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
