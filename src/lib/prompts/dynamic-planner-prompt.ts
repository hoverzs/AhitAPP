import type { DevotionalMemory } from "../devotional-memory";
import { GEMINI_SYSTEM_PROMPT } from "./gemini-system-prompt";

export const PLANNER_SHORT_RETRY_SUFFIX = `

AZ ELŐZŐ VÁLASZ TÚL HOSSZÚ VOLT VAGY ÉRVÉNYTELEN JSON.
Most még rövidebben: max. 500–600 szó, max. 3 rövid bekezdés az elmélkedésben, rövidebb imádság.
Csak a 6 mezős JSON — title, scripture, category, excerpt, devotional, imageKeywords. Semmi más szöveg.`;

export function buildDynamicPlannerSystemPrompt(): string {
  return GEMINI_SYSTEM_PROMPT;
}

export function buildDynamicPlannerUserPrompt(
  memory: DevotionalMemory,
  options?: { shortened?: boolean }
): string {
  const base = `Generáld a ${memory.nextDayNumber}. nap áhítatát.

Új bibliai vers és téma — még nem szerepelt:
${memory.summaryForPrompt}

Válasz: egyetlen érvényes JSON, pontosan 6 mezővel. Tömör legyen — max. 700–900 szó a devotional mezőben.`;

  if (options?.shortened) {
    return `${base}${PLANNER_SHORT_RETRY_SUFFIX}`;
  }

  return base;
}
