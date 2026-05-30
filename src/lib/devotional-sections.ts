import { parseTolerantDevotionalMarkdown } from "./devotional-body-parser";

/** Szekció metaadat — cím normalizálás és ikon azonosító */
export type DevotionalSectionId =
  | "alapige"
  | "elmélkedes"
  | "parhuzam"
  | "kifejtes"
  | "imadsag"
  | "kerdes"
  | "egyeb";

export interface DevotionalSection {
  id: DevotionalSectionId;
  title: string;
  body: string;
}

const SECTION_ALIASES: Array<{ id: DevotionalSectionId; title: string; patterns: RegExp[] }> = [
  {
    id: "alapige",
    title: "Alapige",
    patterns: [/^alapige$/i, /^ige$/i, /^mai alapige$/i, /^bibliai ige$/i],
  },
  {
    id: "elmélkedes",
    title: "Elmélkedés",
    patterns: [/elm[eé]lked[eé]s/i, /^medit[aá]ci[oó]/i],
  },
  {
    id: "parhuzam",
    title: "Mai párhuzam",
    patterns: [/p[aá]rhuzam/i, /^mai p[aá]rhuzam$/i],
  },
  {
    id: "kifejtes",
    title: "Kifejtés",
    patterns: [/^kifejt[eé]s$/i],
  },
  {
    id: "imadsag",
    title: "Mai imádság",
    patterns: [/im[aá]ds[aá]g/i],
  },
  {
    id: "kerdes",
    title: "Gondolatébresztő kérdés",
    patterns: [/gondolat/i, /k[eé]rd[eé]s/i, /ebreszto/i, /ébresztő/i],
  },
];

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveSectionId(headerLine: string): DevotionalSectionId {
  const normalized = normalizeHeader(headerLine.replace(/^#+\s*/, ""));

  for (const entry of SECTION_ALIASES) {
    if (entry.patterns.some((p) => p.test(normalized) || p.test(headerLine))) {
      return entry.id;
    }
  }

  return "egyeb";
}

function resolveSectionTitle(id: DevotionalSectionId, headerLine: string): string {
  const entry = SECTION_ALIASES.find((e) => e.id === id);
  if (entry && id !== "egyeb") return entry.title;
  return headerLine.replace(/^#+\s*/, "").trim() || "Áhítat";
}

/**
 * Markdown content → szekciók (### címsorok mentén).
 * Az első, címsor előtti blokk opcionálisan „Alapige” lehet, ha nincs külön verse mező.
 */
export function parseDevotionalSections(
  content: string,
  options?: { verse?: string; prependVerseAsAlapige?: boolean }
): DevotionalSection[] {
  const sections: DevotionalSection[] = [];
  const trimmed = content.trim();

  if (options?.prependVerseAsAlapige && options.verse?.trim()) {
    const verseBody = formatVerseAsBlockquote(options.verse.trim());
    sections.push({
      id: "alapige",
      title: "Alapige",
      body: verseBody,
    });
  }

  if (!trimmed) {
    return sections;
  }

  const headerRegex = /^#{1,6}\s+(.+)$/gm;
  const matches = [...trimmed.matchAll(headerRegex)];

  if (matches.length === 0) {
    const body = trimmed;
    if (sections.some((s) => s.id === "alapige")) {
      sections[0].body = `${sections[0].body}\n\n${body}`.trim();
    } else {
      sections.push({
        id: options?.verse ? "egyeb" : "alapige",
        title: options?.verse ? "Áhítat" : "Alapige",
        body,
      });
    }
    return sections;
  }

  const firstHeaderIndex = matches[0].index ?? 0;
  const preamble = trimmed.slice(0, firstHeaderIndex).trim();

  if (preamble) {
    const alapige = sections.find((s) => s.id === "alapige");
    if (alapige) {
      alapige.body = `${alapige.body}\n\n${preamble}`.trim();
    } else {
      sections.unshift({
        id: "alapige",
        title: "Alapige",
        body: preamble,
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const headerText = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    const body = trimmed.slice(start, end).trim();

    const id = resolveSectionId(headerText);
    const title = resolveSectionTitle(id, headerText);

    if (id === "alapige" && sections.some((s) => s.id === "alapige")) {
      const existing = sections.find((s) => s.id === "alapige")!;
      existing.body = `${existing.body}\n\n${body}`.trim();
      continue;
    }

    sections.push({ id, title, body });
  }

  return enrichSectionsWithTolerantMeditation(trimmed, sections);
}

/**
 * Ha az Elmélkedés üres, de a toleráns parser talált törzsszöveget — injektáljuk.
 */
function enrichSectionsWithTolerantMeditation(
  content: string,
  sections: DevotionalSection[]
): DevotionalSection[] {
  const filtered = sections.filter((s) => s.body.length > 0);
  const parsed = parseTolerantDevotionalMarkdown(content, { log: false });
  const devotionalBody = parsed.devotional.trim();
  if (!devotionalBody) {
    return filtered;
  }

  const meditation = filtered.find((s) => s.id === "elmélkedes");
  if (meditation) {
    if (!meditation.body.trim()) {
      meditation.body = devotionalBody;
    }
    return filtered;
  }

  const alapigeIndex = filtered.findIndex((s) => s.id === "alapige");
  const insertAt = alapigeIndex >= 0 ? alapigeIndex + 1 : 0;
  const next = [...filtered];
  next.splice(insertAt, 0, {
    id: "elmélkedes",
    title: "Elmélkedés",
    body: devotionalBody,
  });
  return next;
}

/** Bibliai ige blockquote markdownként (ha még nincs > előtag). */
export function formatVerseAsBlockquote(verse: string): string {
  const lines = verse.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.every((l) => l.startsWith(">"))) return lines.join("\n");
  return lines.map((l) => `> ${l}`).join("\n");
}

/** Lista/előnézet: markdown jelek eltávolítása */
export function stripMarkdownForPreview(text: string, maxLen = 140): string {
  const plain = text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n+/g, " ")
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen).trim()}…`;
}
