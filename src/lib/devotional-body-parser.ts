/**
 * Toleráns devotional markdown feldolgozás — nem csak fix ### Elmélkedés headingre támaszkodik.
 */

const LOG_PREFIX = "[devotional-body-parser]";

const DEFAULT_MEDITATION =
  "Ma csendben állj meg Isten előtt, és engedd, hogy szava formálja a napodat.";

export interface ParsedDevotionalMarkdown {
  title: string;
  scripture: string;
  devotional: string;
  prayer: string;
  question: string;
  usedFallback: boolean;
}

type SectionKind = "title" | "alapige" | "meditation" | "prayer" | "question" | "unknown";

interface MarkdownBlock {
  kind: SectionKind;
  header: string;
  body: string;
}

function normalizeHeaderText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function classifyHeader(headerLine: string): SectionKind {
  const n = normalizeHeaderText(headerLine.replace(/^#+\s*/, ""));

  if (/^alapige|^ige$|bibliai\s*ige/.test(n)) return "alapige";
  if (/elmelked|meditac/.test(n)) return "meditation";
  if (/imadsag/.test(n)) return "prayer";
  if (/gondolat|kerdes|ebreszto/.test(n)) return "question";
  if (/^cim$|^title$/.test(n)) return "title";

  return "unknown";
}

function isBlockquoteOnly(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((l) => l.startsWith(">"));
}

function splitScriptureAndMeditation(body: string): {
  scripture: string;
  extraMeditation: string;
} {
  const trimmed = body.trim();
  if (!trimmed) return { scripture: "", extraMeditation: "" };

  if (isBlockquoteOnly(trimmed)) {
    return { scripture: trimmed, extraMeditation: "" };
  }

  const lines = trimmed.split(/\n/);
  const quoteLines: string[] = [];
  const restLines: string[] = [];
  let inQuote = true;

  for (const line of lines) {
    const t = line.trim();
    if (inQuote && (t.startsWith(">") || (quoteLines.length === 0 && t.length > 0))) {
      if (t.startsWith(">")) quoteLines.push(line);
      else if (quoteLines.length === 0) quoteLines.push(`> ${t}`);
      else restLines.push(line);
    } else {
      inQuote = false;
      restLines.push(line);
    }
  }

  const extra = restLines.join("\n").trim();
  if (quoteLines.length === 0) {
    return { scripture: trimmed, extraMeditation: "" };
  }

  return {
    scripture: quoteLines.join("\n").trim(),
    extraMeditation: extra,
  };
}

function parseBlocks(markdown: string): MarkdownBlock[] {
  const trimmed = markdown.trim();
  if (!trimmed) return [];

  const headerRegex = /^#{1,6}\s+(.+)$/gm;
  const matches = [...trimmed.matchAll(headerRegex)];

  if (matches.length === 0) {
    return [{ kind: "unknown", header: "", body: trimmed }];
  }

  const blocks: MarkdownBlock[] = [];
  const preamble = trimmed.slice(0, matches[0].index ?? 0).trim();

  if (preamble) {
    const firstLine = preamble.split(/\n/)[0]?.trim() ?? "";
    const looksLikeTitle =
      /^#{1,6}\s/.test(firstLine) ||
      (firstLine.length < 120 && !firstLine.startsWith(">") && preamble.indexOf("\n\n") < 0);

    if (looksLikeTitle && preamble.length < 200) {
      blocks.push({
        kind: "title",
        header: "Cím",
        body: preamble.replace(/^#+\s*/, "").trim(),
      });
    } else {
      blocks.push({ kind: "unknown", header: "", body: preamble });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const header = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    const body = trimmed.slice(start, end).trim();

    blocks.push({
      kind: classifyHeader(header),
      header,
      body,
    });
  }

  return blocks;
}

function collectMeditationFromBlocks(blocks: MarkdownBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.kind === "meditation" && block.body.trim()) {
      parts.push(block.body.trim());
    }
    if (block.kind === "unknown" && block.body.trim()) {
      parts.push(block.body.trim());
    }
    if (block.kind === "alapige" && block.body.trim()) {
      const { extraMeditation } = splitScriptureAndMeditation(block.body);
      if (extraMeditation) parts.push(extraMeditation);
    }
  }

  return parts.join("\n\n").trim();
}

/** Fallback: teljes szövegből kivonjuk a cím/ige/imádság/kérdés részeket, a maradék = elmélkedés. */
function fallbackDevotionalFromRaw(markdown: string, blocks: MarkdownBlock[]): string {
  let text = markdown.trim();

  for (const block of blocks) {
    if (block.kind === "title" && block.body) {
      text = text.replace(block.body, "").trim();
    }
    if (block.header) {
      const headerPattern = new RegExp(
        `^#{1,6}\\s+${escapeRegex(block.header)}\\s*$[\\s\\S]*?(?=^#{1,6}\\s+|$)`,
        "im"
      );
      text = text.replace(headerPattern, "").trim();
    }
  }

  text = text
    .replace(/^#{1,6}\s+.+$/gm, "")
    .replace(/^>\s?.+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveScripture(blocks: MarkdownBlock[]): string {
  const alapige = blocks.find((b) => b.kind === "alapige");
  if (!alapige?.body.trim()) return "";

  const { scripture } = splitScriptureAndMeditation(alapige.body);
  return scripture.trim();
}

function resolveTitle(blocks: MarkdownBlock[], markdown: string): string {
  const titleBlock = blocks.find((b) => b.kind === "title");
  if (titleBlock?.body.trim()) return titleBlock.body.trim();

  const preamble = markdown.trim().split(/^#{1,6}\s+/m)[0]?.trim() ?? "";
  const firstLine = preamble.split(/\n/)[0]?.trim() ?? "";
  if (
    firstLine &&
    firstLine.length < 120 &&
    !firstLine.startsWith(">") &&
    !/imadsag|elmelked|alapige/i.test(normalizeHeaderText(firstLine))
  ) {
    return firstLine.replace(/^#+\s*/, "");
  }

  return "";
}

export function logParsedDevotionalSections(parsed: ParsedDevotionalMarkdown): void {
  console.log(`${LOG_PREFIX} parsed sections:`, {
    title: parsed.title ? `${parsed.title.slice(0, 60)}…` : "(empty)",
    scriptureLength: parsed.scripture.length,
    devotionalLength: parsed.devotional.length,
    prayerDetected: parsed.prayer.length > 0,
    questionDetected: parsed.question.length > 0,
    usedFallback: parsed.usedFallback,
  });
}

/**
 * Toleráns markdown → strukturált részek (mindig legyen devotional szöveg).
 */
export function parseTolerantDevotionalMarkdown(
  raw: string,
  options?: { log?: boolean; defaultTitle?: string }
): ParsedDevotionalMarkdown {
  const markdown = raw
    .replace(/```(?:markdown|md)?/gi, "")
    .replace(/```/g, "")
    .trim();

  const blocks = parseBlocks(markdown);

  const title = resolveTitle(blocks, markdown) || options?.defaultTitle?.trim() || "";
  const scripture = resolveScripture(blocks);
  const prayer =
    blocks.find((b) => b.kind === "prayer")?.body.trim() ?? "";
  const question =
    blocks.find((b) => b.kind === "question")?.body.trim() ?? "";

  let devotional = collectMeditationFromBlocks(blocks);
  let usedFallback = false;

  if (!devotional || devotional.length < 40) {
    const fallback = fallbackDevotionalFromRaw(markdown, blocks);
    if (fallback.length >= 40) {
      devotional = fallback;
      usedFallback = true;
    }
  }

  if (!devotional || devotional.length < 20) {
    devotional = markdown.length >= 20 ? markdown : DEFAULT_MEDITATION;
    usedFallback = true;
  }

  const result: ParsedDevotionalMarkdown = {
    title,
    scripture,
    devotional: devotional.trim(),
    prayer,
    question,
    usedFallback,
  };

  if (options?.log !== false) {
    logParsedDevotionalSections(result);
  }

  return result;
}

/** Kanonikus markdown összeállítás — garantált nem üres Elmélkedés. */
export function rebuildDevotionalMarkdown(
  parsed: ParsedDevotionalMarkdown,
  options?: { scriptureFallback?: string; omitAlapigeInContent?: boolean }
): string {
  const parts: string[] = [];

  if (parsed.title) {
    parts.push(parsed.title);
    parts.push("");
  }

  const scriptureBody =
    parsed.scripture.trim() ||
    (options?.scriptureFallback
      ? `> ${options.scriptureFallback.replace(/^>\s?/gm, "").trim()}`
      : "");

  if (scriptureBody && !options?.omitAlapigeInContent) {
    parts.push("### Alapige");
    parts.push("");
    parts.push(scriptureBody.startsWith(">") ? scriptureBody : `> ${scriptureBody}`);
    parts.push("");
  }

  parts.push("### Elmélkedés");
  parts.push("");
  parts.push(parsed.devotional.trim() || DEFAULT_MEDITATION);

  if (parsed.prayer.trim()) {
    parts.push("");
    parts.push("### Mai imádság");
    parts.push("");
    parts.push(parsed.prayer.trim());
  }

  if (parsed.question.trim()) {
    parts.push("");
    parts.push("### Gondolatébresztő kérdés");
    parts.push("");
    parts.push(parsed.question.trim());
  }

  return parts.join("\n").trim();
}

/** Meglévő content → garantált nem üres elmélkedés szekció a UI számára. */
export function ensureDevotionalMeditationInContent(
  content: string,
  verse?: string
): string {
  const parsed = parseTolerantDevotionalMarkdown(content, {
    log: true,
    defaultTitle: "",
  });

  if (!parsed.scripture && verse?.trim()) {
    parsed.scripture = verse
      .split(/\n/)
      .map((l) => (l.startsWith(">") ? l : `> ${l}`))
      .join("\n");
  }

  return rebuildDevotionalMarkdown(parsed, {
    scriptureFallback: verse,
    omitAlapigeInContent: Boolean(verse?.trim()),
  });
}
