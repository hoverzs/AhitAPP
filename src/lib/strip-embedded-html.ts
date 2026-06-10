/**
 * Beágyazott HTML eltávolítása áhítat szövegből — a react-markdown nyers tagként jeleníti meg.
 */

const BLOCK_END_TAGS =
  /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|section|article|header|footer|tr|table|thead|tbody)\b[^>]*>/gi;

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

function removeDangerousBlocks(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
}

function blockTagsToNewlines(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(BLOCK_END_TAGS, "\n");
}

function removeRemainingTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * HTML tagek és attribútumok eltávolítása — a látható szöveg megmarad.
 * Escaped entitások (&lt;h1&gt;) is kezelve.
 */
export function stripEmbeddedHtml(text: string): string {
  if (!text.includes("<") && !text.includes("&lt;")) {
    return text;
  }

  let result = decodeBasicHtmlEntities(text);
  result = removeDangerousBlocks(result);
  result = blockTagsToNewlines(result);
  result = removeRemainingTags(result);
  result = decodeBasicHtmlEntities(result);
  return collapseWhitespace(result);
}
