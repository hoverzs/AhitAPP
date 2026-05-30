import { extractVerseReference } from "./devotional-memory";

export interface ScriptureParts {
  reference: string;
  text: string;
  full: string;
}

/** „Zsoltárok 23:1 — szöveg” / blockquote / csak hivatkozás. */
export function parseScriptureParts(scripture: string): ScriptureParts {
  const full = stripBlockquoteMarkers(scripture).trim();
  if (!full) {
    return { reference: "", text: "", full: "" };
  }

  const dash = full.match(/^(.+?)\s*[—–-]\s+([\s\S]+)$/);
  if (dash) {
    return {
      reference: dash[1].trim(),
      text: dash[2].trim(),
      full,
    };
  }

  return { reference: full, text: "", full };
}

function stripBlockquoteMarkers(text: string): string {
  return text
    .split(/\n/)
    .map((l) => l.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function plainScriptureText(text: string): string {
  return stripBlockquoteMarkers(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReference(ref: string): string {
  return ref
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ugyanaz az igehely / idézet-e (formátumtól függetlenül). */
export function scripturesEquivalent(a: string, b: string): boolean {
  const pa = parseScriptureParts(a);
  const pb = parseScriptureParts(b);
  if (!pa.full || !pb.full) return false;

  const plainA = plainScriptureText(pa.full);
  const plainB = plainScriptureText(pb.full);
  if (plainA === plainB) return true;

  if (plainA.length >= 16 && plainB.length >= 16) {
    if (plainA.includes(plainB) || plainB.includes(plainA)) return true;
  }

  const refA = normalizeReference(extractVerseReference(pa.full));
  const refB = normalizeReference(extractVerseReference(pb.full));
  if (refA && refB && refA === refB) {
    if (!pa.text || !pb.text) return true;
    const textA = plainScriptureText(pa.text);
    const textB = plainScriptureText(pb.text);
    if (textA === textB) return true;
    if (textA && textB && (textA.includes(textB) || textB.includes(textA))) {
      return true;
    }
    return true;
  }

  return false;
}

function isAlapigeHeaderLine(headerLine: string): boolean {
  const n = headerLine
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /^alapige|^ige$|bibliai\s*ige/.test(n);
}

/**
 * Eltávolítja a markdown ### Alapige (és hasonló) szekciókat.
 */
export function stripAlapigeSectionsFromMarkdown(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return "";

  const headerRegex = /^#{1,6}\s+(.+)$/gm;
  const matches = [...trimmed.matchAll(headerRegex)];
  if (matches.length === 0) return trimmed;

  const removeRanges: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < matches.length; i++) {
    const headerText = matches[i][1].trim();
    if (!isAlapigeHeaderLine(headerText)) continue;

    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? trimmed.length)
        : trimmed.length;
    removeRanges.push({ start, end });
  }

  if (removeRanges.length === 0) return trimmed;

  let result = "";
  let cursor = 0;
  for (const range of removeRanges) {
    result += trimmed.slice(cursor, range.start);
    cursor = range.end;
  }
  result += trimmed.slice(cursor);

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Ha van külön scripture/verse mező, a markdownból kiszűri az ismétlődő alapigét.
 */
export function deduplicateScripture(
  scripture: string,
  markdown: string
): { scripture: string; markdown: string } {
  const canonicalScripture = scripture.trim();
  let md = markdown.trim();

  if (!canonicalScripture) {
    return { scripture: canonicalScripture, markdown: md };
  }

  md = stripAlapigeSectionsFromMarkdown(md);

  const headerRegex = /^#{1,6}\s+(.+)$/gm;
  const firstHeader = headerRegex.exec(md);
  if (!firstHeader) {
    const preamble = md.trim();
    if (preamble && scripturesEquivalent(canonicalScripture, preamble)) {
      md = "";
    }
  } else {
    const preamble = md.slice(0, firstHeader.index ?? 0).trim();
    if (preamble && scripturesEquivalent(canonicalScripture, preamble)) {
      md = md.slice(firstHeader.index ?? 0).trim();
    }
  }

  return { scripture: canonicalScripture, markdown: md.trim() };
}

/** Blockquote a canonical scripture mezőből (megjelenítéshez). */
export function formatCanonicalScriptureBlockquote(scripture: string): string {
  const parts = parseScriptureParts(scripture);
  if (!parts.full) return "";

  const line =
    parts.text && parts.reference
      ? `${parts.reference} — ${parts.text}`
      : parts.full;

  return line
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith(">") ? l : `> ${l}`))
    .join("\n");
}
