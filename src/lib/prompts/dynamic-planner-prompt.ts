import type { DevotionalMemory } from "../devotional-memory";
import { GEMINI_SYSTEM_PROMPT } from "./gemini-system-prompt";

export const PLANNER_SHORT_RETRY_SUFFIX = `

Az előző válasz túl hosszú lett (token limit). Kérlek, rövidített változatban:
- verse: rövid ige + hely
- content: ### Alapige, ### Elmélkedés (max. 3 bekezdés), ### Mai imádság, ### Gondolatébresztő kérdés
- összesen max. 2000 karakter a contentben
Csak a JSON objektum, { karakterrel kezdve.`;

export function buildDynamicPlannerSystemPrompt(): string {
  return GEMINI_SYSTEM_PROMPT;
}

export function buildDynamicPlannerUserPrompt(
  memory: DevotionalMemory,
  options?: { shortened?: boolean }
): string {
  const base = `Generáld a ${memory.nextDayNumber}. nap áhítatát.

A JSON "dayNumber" mezője legyen pontosan ${memory.nextDayNumber}.
Válassz új bibliai verset és témát (category), amelyek még nem szerepeltek:
${memory.summaryForPrompt}

Terjedelem: kb. 2500–4500 karakter összesen. Csak egy érvényes JSON objektumot adj vissza — kezdd a { karakterrel, zárd a } karakterrel. Ne használj markdown kódblokkot.`;

  if (options?.shortened) {
    return `${base}${PLANNER_SHORT_RETRY_SUFFIX}`;
  }

  return base;
}
