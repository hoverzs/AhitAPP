import type { Devotional } from "./types";
import { extractDevotionalExcerpt } from "./devotional-excerpt";
import { getSiteUrl } from "./site-url";

/** Plain szöveg első 2–3 mondata (honlapra ajánló bevezetőhöz). */
function takeIntroSentences(text: string, maxSentences = 3): string {
  const plain = text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n+/g, " ")
    .trim();

  if (!plain) return "";

  const sentences =
    plain.match(/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/g)?.map((s) => s.trim()) ??
    [plain];

  if (sentences.length >= 2) {
    return sentences.slice(0, maxSentences).join(" ").trim();
  }

  return plain.length > 420 ? `${plain.slice(0, 420).trim()}…` : plain;
}

function extractWebsiteIntro(devotional: Devotional): string {
  const fromContent = takeIntroSentences(
    extractDevotionalExcerpt(devotional.content, 2)
  );
  if (fromContent) return fromContent;

  const fromFacebook = devotional.facebookCopy?.trim();
  if (fromFacebook) return takeIntroSentences(fromFacebook);

  return devotional.title.trim();
}

/** Honlapra beágyazható rövid ajánló — cím, 2–3 mondat, link. */
export function formatDevotionalForWebsiteEmbed(
  devotional: Devotional,
  publicUrl: string
): string {
  return [
    "Napi áhítat",
    extractWebsiteIntro(devotional),
    "",
    "Tovább olvasom:",
    publicUrl,
  ].join("\n");
}

/** Rövid Facebook-szöveg + éles publikus link. */
export function formatDevotionalShortForFacebook(
  shortCopy: string,
  publicUrl: string
): string {
  const body = shortCopy.trim();
  if (!body) return publicUrl;
  if (body.includes(publicUrl)) return body;
  return `${body}\n\n👉 Olvasd el itt: ${publicUrl}`;
}

/** A content mező plain szöveg / egyszerű Markdown — linkkel kiegészítve megosztható. */
export function formatDevotionalForFacebook(
  devotional: Devotional,
  publicUrl: string
): string {
  const body =
    devotional.facebookCopy?.trim() ||
    devotional.content.replace(/^#+\s+/gm, "").trim().slice(0, 900);

  return formatDevotionalShortForFacebook(body, publicUrl).concat(
    "\n",
    "",
    "#áhítat #napiige #hit"
  );
}

/** Nyilvános áhítat URL — mindig NEXT_PUBLIC_SITE_URL alapján (nem window.location). */
export function getPublicDevotionalUrl(dayNumber: number): string {
  return `${getSiteUrl()}/nap/${dayNumber}`;
}
