import { parseTolerantDevotionalMarkdown } from "./devotional-body-parser";

/** Admin figyelmeztetés — félbeszakadt generálás. */
export const TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE =
  "A generált szöveg félbeszakadt, kézi ellenőrzés szükséges.";

const VALID_TERMINAL = /[.!?…"»„"']\s*$/u;

const ABRUPT_END = /[,;:–—-]\s*$/u;

const INCOMPLETE_CONNECTOR_TAIL =
  /\b(és|vagy|hogy|ahogy|míg|mert|de|ha|mint|egy|nem|lesz|volt|lenne|legyen|aki|amit|amely|amikor|ahol|így|még|csak|vagyis)\s*$/iu;

export interface DevotionalContentAssessment {
  complete: boolean;
  reasons: string[];
}

export interface IsCompleteTextOptions {
  /** Alapértelmezett: 800 */
  minChars?: number;
}

/**
 * A szöveg teljesnek tűnik-e (nem vágott közben).
 * Production: inkább rövid, de lezárt szöveg.
 */
export function isCompleteText(
  text: string,
  options?: IsCompleteTextOptions
): boolean {
  const minChars = options?.minChars ?? 800;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length < minChars) return false;
  if (hasAbruptEnding(trimmed)) return false;
  if (endsWithTruncatedWord(trimmed)) return false;
  if (!hasValidTerminalPunctuation(trimmed)) return false;
  return true;
}

function hasValidTerminalPunctuation(text: string): boolean {
  const t = text.trimEnd();
  if (VALID_TERMINAL.test(t)) return true;
  if (/[.!?…]["»„]\s*$/.test(t)) return true;
  return false;
}

function hasAbruptEnding(text: string): boolean {
  if (ABRUPT_END.test(text)) return true;
  if (INCOMPLETE_CONNECTOR_TAIL.test(text)) return true;
  return false;
}

function endsWithTruncatedWord(text: string): boolean {
  const t = text.trimEnd();

  if (/[\p{L}]$/u.test(t) && !hasValidTerminalPunctuation(t)) {
    return true;
  }

  if (endsWithTruncatedEllipsis(t)) {
    return true;
  }

  const lastWord = t.match(/([\p{L}áéíóöőúüűÁÉÍÓÖŐÚÜŰ-]+)\s*$/u)?.[1];
  if (lastWord && lastWord.length <= 3 && !hasValidTerminalPunctuation(t)) {
    return true;
  }

  return false;
}

/** „megold…” típusú Gemini-vágás. */
function endsWithTruncatedEllipsis(text: string): boolean {
  const m = text.match(/([\p{L}áéíóöőúüűÁÉÍÓÖŐÚÜŰ]+)(\.{2,}|…)\s*$/u);
  if (!m) return false;

  const word = m[1];
  if (/^(stb|igen|úgy|így|ahogy)$/iu.test(word)) return false;

  const before = text.slice(0, text.length - m[0].length);
  const recent = before.slice(-140);
  const hasClosedSentence = /[.!?]\s/.test(recent) || /[.!?]\s*$/.test(recent.trim());

  return !hasClosedSentence;
}

export interface AssessDevotionalContentOptions {
  /** Rövidebb retry után alacsonyabb minimum. */
  shortened?: boolean;
}

/**
 * Generált markdown teljesség — elmélkedés, ima, kérdés.
 */
export function assessGeneratedDevotionalContent(
  content: string,
  options?: AssessDevotionalContentOptions
): DevotionalContentAssessment {
  const parsed = parseTolerantDevotionalMarkdown(content, { log: false });
  const minMeditation = options?.shortened ? 600 : 800;
  const reasons: string[] = [];

  if (!isCompleteText(parsed.devotional, { minChars: minMeditation })) {
    reasons.push("incomplete_meditation");
  }

  const prayer = parsed.prayer.trim();
  if (!prayer || prayer.length < 25) {
    reasons.push("missing_prayer");
  } else if (!isCompleteText(prayer, { minChars: 25 })) {
    reasons.push("incomplete_prayer");
  }

  const question = parsed.question.trim();
  if (!question || question.length < 10) {
    reasons.push("missing_question");
  } else if (!/\?\s*$/.test(question) && !isCompleteText(question, { minChars: 10 })) {
    reasons.push("incomplete_question");
  }

  return { complete: reasons.length === 0, reasons };
}

/** Nyilvános megjelenítéshez — published + teljes szöveg. */
export function isPublishableDevotionalContent(content: string): boolean {
  return assessGeneratedDevotionalContent(content).complete;
}
