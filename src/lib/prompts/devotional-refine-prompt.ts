import type { Devotional } from "../types";

export const REFINE_PROMPT_VERSION = "2026-05-devotional-refine-v1";

export function buildDevotionalRefineSystemPrompt(): string {
  return `Te egy tapasztalt keresztény áhítatszerkesztő asszisztens vagy.

Feladatod: a meglévő napi áhítat SZÖVEGÉT célzottan finomítsd az admin instrukciója szerint.
Ez NEM teljes újragenerálás. Ez kontrollált, iteratív átdolgozás (controlled rewrite).

SZABÁLYOK:
- Tartsd meg az alapige teológiai lényegét és pontosságát.
- Ne találj ki új bibliai igét, hacsak az instrukció nem kéri.
- Ne írd újra teljesen más témára — finomítsd a meglévőt.
- A stílus: lelki, meditatív, közérthető, személyes, nem prédikációszerű, nem moralizáló.
- Rövid bekezdések, mobilon olvasható.
- A fontos mondatokat emeld ki **félkövérrel**, ahol indokolt.
- Ne használj Unicode „szépített” betűket.

KIMENET — egyetlen érvényes JSON objektum, markdown kódblokkok NÉLKÜL:
{
  "title": "...",
  "verse": "...",
  "category": "...",
  "content": "... markdown szekciók ...",
  "prayer": "... rövid imádság szöveg (opcionális, ha külön is megadod)",
  "reflectionQuestion": "... egy rövid kérdés (opcionális)",
  "facebookCopy": "... 600–900 karakter Facebook szöveg, 1 kulcsgondolat **félkövérrel**",
  "imageKeywords": "... angol stockfotó kulcsszavak (opcionális)"
}

A "content" markdown szerkezete (pontos ### címsorok):
### Alapige
> blockquote formában

### Elmélkedés
3–5 rövid bekezdés

### Mai imádság
3–6 mondat

### Gondolatébresztő kérdés
1 rövid személyes kérdés

Ha az admin nem kéri a kép kulcsszavak frissítését, hagyd ki az imageKeywords mezőt vagy add vissza üresen.`;
}

export function buildDevotionalRefineUserPrompt(
  devotional: Devotional,
  instruction: string,
  options?: { updateImageKeywords?: boolean }
): string {
  const updateKeywords = options?.updateImageKeywords === true;

  return `Finomítsd az alábbi áhítatot a megadott instrukció szerint.

--- ADMIN INSTRUKCIÓ ---
${instruction.trim()}

--- EREDETI ALAPIGE ---
${devotional.verse.trim()}

--- JELENLEGI CÍM ---
${devotional.title.trim()}

--- JELENLEGI KATEGÓRIA ---
${devotional.category?.trim() || "—"}

--- JELENLEGI ÁHÍTAT (markdown) ---
${devotional.content.trim()}

--- JELENLEGI FACEBOOK SZÖVEG ---
${devotional.facebookCopy?.trim() || "—"}

--- KÉP KULCSSZAVAK ---
${updateKeywords ? "Frissítsd az imageKeywords mezőt is az új hangulathoz." : "Ne módosítsd az imageKeywords mezőt — hagyd ki vagy add vissza üresen."}

Válaszolj csak a JSON objektummal. Ne magyarázd el a változtatásokat.`;
}

/** Gyors instrukció javaslatok az admin UI-hoz */
export const REFINE_INSTRUCTION_SUGGESTIONS = [
  "Legyen rövidebb és tömörebb.",
  "Legyen személyesebb, közvetlenebb hangvételű.",
  "Legyen kevésbé moralizáló, inkább invitáló.",
  "Maradjon teológiailag pontos, de egyszerűsítsd a nyelvezetet.",
  "Legyen elmélkedőbb, csendesebb ritmusú.",
  "Erősítsd a zárógondolatot és a gondolatébresztő kérdést.",
  "Emelj ki több kulcsmondatot **félkövér** formázással.",
  "A Mai imádság legyen meghittebb és rövidebb.",
] as const;
