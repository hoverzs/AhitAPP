import { parseDevotionalSections } from "./devotional-sections";
import { formatVerseAsBlockquote } from "./devotional-sections";
import type { Devotional } from "./types";

/** Markdown jelek eltávolítása mező tároláshoz */
export function plainTextFromMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPrayerAndReflection(content: string): {
  prayer?: string;
  reflectionQuestion?: string;
} {
  const sections = parseDevotionalSections(content);
  const prayerSec = sections.find((s) => s.id === "imadsag");
  const questionSec = sections.find((s) => s.id === "kerdes");

  return {
    prayer: prayerSec?.body ? plainTextFromMarkdown(prayerSec.body) : undefined,
    reflectionQuestion: questionSec?.body
      ? plainTextFromMarkdown(questionSec.body)
      : undefined,
  };
}

export interface EditableDevotionalFields {
  title: string;
  verse: string;
  meditation: string;
  prayer: string;
  reflectionQuestion: string;
  facebookCopy: string;
  category: string;
}

export function parseEditableFields(devotional: Devotional): EditableDevotionalFields {
  const sections = parseDevotionalSections(devotional.content, {
    prependVerseAsAlapige: false,
  });

  const meditationParts = sections.filter(
    (s) =>
      s.id === "elmélkedes" ||
      s.id === "parhuzam" ||
      s.id === "kifejtes" ||
      s.id === "egyeb"
  );

  const meditationFromContent = meditationParts.map((s) => s.body).join("\n\n").trim();

  return {
    title: devotional.title,
    verse: devotional.verse,
    meditation: meditationFromContent || devotional.content,
    prayer: devotional.prayer ?? extractPrayerAndReflection(devotional.content).prayer ?? "",
    reflectionQuestion:
      devotional.reflectionQuestion ??
      extractPrayerAndReflection(devotional.content).reflectionQuestion ??
      "",
    facebookCopy: devotional.facebookCopy ?? "",
    category: devotional.category ?? "",
  };
}

/** Szerkesztő mezőkből markdown content összeállítása. */
export function buildContentFromEditableFields(
  fields: Pick<
    EditableDevotionalFields,
    "meditation" | "prayer" | "reflectionQuestion"
  >
): string {
  const blocks: string[] = [];

  if (fields.meditation.trim()) {
    blocks.push("### Elmélkedés");
    blocks.push(fields.meditation.trim());
  }

  if (fields.prayer.trim()) {
    blocks.push("### Mai imádság");
    blocks.push(fields.prayer.trim());
  }

  if (fields.reflectionQuestion.trim()) {
    blocks.push("### Gondolatébresztő kérdés");
    blocks.push(fields.reflectionQuestion.trim());
  }

  return blocks.join("\n\n");
}

export function buildFullDevotionalFromEditable(
  fields: EditableDevotionalFields
): { verse: string; content: string; prayer: string; reflectionQuestion: string } {
  const alapigeBlock = fields.verse.trim()
    ? `### Alapige\n\n${formatVerseAsBlockquote(fields.verse.trim())}`
    : "";

  const body = buildContentFromEditableFields(fields);
  const content = [alapigeBlock, body].filter(Boolean).join("\n\n");

  return {
    verse: fields.verse.trim(),
    content,
    prayer: plainTextFromMarkdown(fields.prayer),
    reflectionQuestion: plainTextFromMarkdown(fields.reflectionQuestion),
  };
}
