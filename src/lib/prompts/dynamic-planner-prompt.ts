import type { DevotionalMemory } from "../devotional-memory";
import { GEMINI_SYSTEM_PROMPT } from "./gemini-system-prompt";

export const PLANNER_SHORT_RETRY_SUFFIX = `

AZ ELŐZŐ VÁLASZ TÚL HOSSZÚ VAGY HIBÁS JSON.
Most max. 350–450 szó, max. 3 rövid bekezdés, rövidebb imádság.
Csak a 6 mezős JSON. imageKeywords: max. 4 angol szó.`;

export function buildDynamicPlannerSystemPrompt(shortened?: boolean): string {
  if (!shortened) return GEMINI_SYSTEM_PROMPT;
  return `${GEMINI_SYSTEM_PROMPT}\n\nMOST EXTRA RÖVIDEN: max. 350–450 szó, minél kevesebb token.`;
}

export function buildDynamicPlannerUserPrompt(
  memory: DevotionalMemory,
  options?: { shortened?: boolean }
): string {
  const wordCap = options?.shortened ? "350–450" : "500–700";

  const base = `Generáld a ${memory.nextDayNumber}. nap áhítatát.

Új vers és téma (még nem szerepelt):
${memory.summaryForPrompt}

Egyetlen érvényes JSON, 6 mező. Összesen max. ${wordCap} szó a devotional mezőben.`;

  if (options?.shortened) {
    return `${base}${PLANNER_SHORT_RETRY_SUFFIX}`;
  }

  return base;
}
