import type { DevotionalMemory } from "../devotional-memory";
import {
  buildDuplicateVerseRejectionsBlock,
  buildUsedVerseReferencesPromptBlock,
} from "../duplicate-verse-retry";
import { SCRIPTURE_SELECTION_GUIDELINES } from "./gemini-system-prompt";

export const METADATA_SYSTEM_PROMPT = `Te keresztény áhítat-szerkesztő vagy. CSAK rövid metadata JSON-t adsz vissza — NEM írsz áhítat szöveget.

${SCRIPTURE_SELECTION_GUIDELINES}

A scripture mezőben adj teljes alapigét: „Könyv fejezet:vers — rövid magyar szöveg” (1–3 mondat, szó szerinti vagy közérthető fordítás).

SOHA ne válassz olyan igehelyet, amely szerepel a „már használt igehelyek” listában.

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

export function buildMetadataUserPrompt(
  memory: DevotionalMemory,
  options?: { rejectedReferencesThisRun?: string[] }
): string {
  const usedBlock = buildUsedVerseReferencesPromptBlock(memory);
  const rejectionsBlock = buildDuplicateVerseRejectionsBlock(
    options?.rejectedReferencesThisRun ?? []
  );

  return `A ${memory.nextDayNumber}. nap metadata-ja.

${usedBlock}

További kontextus (napok, kategóriák):
${memory.summaryForPrompt}

Válassz új, még nem használt alapigét a fenti irányelvek és a tiltott lista szerint.
Tartsd a sorozat tematikus/logikai ívét (kategória, nap száma).
Csak a 5 mezős JSON. Ne írj áhítat szöveget.${rejectionsBlock}`;
}
