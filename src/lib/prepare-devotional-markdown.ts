import { stripEmbeddedHtml } from "./strip-embedded-html";

/**
 * Áhítat szekciótörzs előkészítése react-markdownhoz.
 * Nem módosítja a ### címsorokat (csak szekció body).
 */

/** Unicode csillagok → ASCII (Gemini néha speciális karaktert ad). */
function normalizeAsterisks(text: string): string {
  return text
    .replace(/\u2217|\uFF0A|\u2055/g, "*")
    .replace(/\u2014/g, "—");
}

/** Páratlan ** számláló — záró jelek pótlása vagy eltávolítása. */
function balanceBoldMarkers(text: string): string {
  const count = (text.match(/\*\*/g) ?? []).length;
  if (count % 2 === 0) return text;
  return text.replace(/\*\*\s*$/, "").replace(/\*\*([^*\n]+)$/, "$1");
}

/** Egyszerű *dőlt* párosítás — csak szóhatáron belül. */
function balanceItalicMarkers(text: string): string {
  const withoutBold = text.replace(/\*\*[\s\S]*?\*\*/g, (m) =>
    m.replace(/\*/g, "\u0000")
  );
  const singles = (withoutBold.match(/(?<!\*)\*(?!\*)/g) ?? []).length;
  const restored = withoutBold.replace(/\u0000/g, "*");
  if (singles % 2 === 0) return restored;
  const last = restored.lastIndexOf("*");
  if (last < 0) return restored;
  return `${restored.slice(0, last)}${restored.slice(last + 1)}`;
}

/** Szekción belüli kódkerítés eltávolítása. */
function stripInlineCodeFences(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*$/gim, "")
    .replace(/^```\s*$/gim, "")
    .trim();
}

/**
 * Markdown body renderelés előtt — bold/italic/blockquote működjön, ne maradjon nyers szintaxis.
 */
export function prepareDevotionalMarkdownForRender(source: string): string {
  let text = source.trim();
  if (!text) return "";

  text = stripEmbeddedHtml(text);
  text = stripInlineCodeFences(text);
  text = normalizeAsterisks(text);
  text = balanceBoldMarkers(text);
  text = balanceItalicMarkers(text);

  return text;
}
