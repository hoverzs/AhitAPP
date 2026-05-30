import type { DevotionalMemory } from "../devotional-memory";

export const METADATA_SYSTEM_PROMPT = `Te keresztény áhítat-szerkesztő vagy. CSAK rövid metadata JSON-t adsz vissza — NEM írsz áhítat szöveget.

KIMENET — egyetlen JSON objektum, { kezdet } { vég }, NINCS kódblokk:
{
  "title": "rövid cím",
  "scripture": "Zsoltárok 23:1 — rövid ige",
  "category": "Békesség",
  "excerpt": "max 2 mondat",
  "imageKeywords": "lake, soft light, quiet path, dawn"
}

SZABÁLYOK:
- CSAK a 5 mező fent — nincs devotional, content, prayer, reflection, tömb, beágyazott objektum
- imageKeywords: max. 4 rövid angol szó, vesszővel
- A teljes válasz legyen rövid (< 400 token)`;

export function buildMetadataUserPrompt(memory: DevotionalMemory): string {
  return `A ${memory.nextDayNumber}. nap metadata-ja.

Új bibliai vers és téma (még nem szerepelt):
${memory.summaryForPrompt}

Csak a 5 mezős JSON. Ne írj áhítat szöveget.`;
}
