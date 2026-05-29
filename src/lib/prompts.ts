/**
 * Rendszerprompt a Gemini számára — napi áhítat generálás (legacy / SDK útvonal).
 */
export { GEMINI_SYSTEM_PROMPT } from "./prompts/gemini-system-prompt";

/** @deprecated Használd a GEMINI_SYSTEM_PROMPT konstanst */
export { GEMINI_SYSTEM_PROMPT as DEVOTIONAL_SYSTEM_PROMPT } from "./prompts/gemini-system-prompt";

export function buildUserPrompt(verseText: string, dayNumber: number): string {
  return `Nap száma: ${dayNumber}
Bibliai igehely és szövege: ${verseText}

Csak egy érvényes JSON objektumot adj vissza — kezdd a { karakterrel, zárd a } karakterrel. Ne használj markdown kódblokkot.`;
}

export function buildImagePrompt(imagePromptSubject: string, verseText: string): string {
  return `Minimalist, symbolic, atmospheric Christian devotional illustration. Subject: ${imagePromptSubject}. Inspired by the verse: "${verseText}". Soft watercolor texture, warm muted palette (cream, gold, slate blue), no text, no faces, no logos, serene and contemplative, wide cinematic composition, fine art quality.`;
}
