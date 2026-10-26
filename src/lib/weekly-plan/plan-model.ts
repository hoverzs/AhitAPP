import {
  GEMINI_PLANNER_MODEL,
  GEMINI_WEEK_PLAN_MAX_OUTPUT_TOKENS,
  GEMINI_WEEK_PLAN_RETRY_MAX_OUTPUT_TOKENS,
  GEMINI_WEEK_PLAN_RETRY_THINKING_BUDGET,
  GEMINI_WEEK_PLAN_THINKING_BUDGET,
} from "../config";
import { geminiGenerateContentRestDetailed } from "../gemini-fetch";
import { isGeminiOutputTruncated } from "../gemini-response";
import { usageForLog } from "../devotional-generation-log";
import { isAnyStorageError } from "../storage";
import { WeeklyPlanGenerationError } from "./errors";
import { PlanParseError, parsePlanJson, type PlanDraft } from "./parse";
import { buildRepairUserPrompt, WEEK_PLAN_SYSTEM_PROMPT } from "./prompts";
import {
  findPlanConflicts,
  type PlanRegistry,
  type WeeklyPlan,
} from "./types";

const PLAN_MAX_ATTEMPTS = 2;

/**
 * Egy Gemini-hívás a heti tervhez: JSON válasz, korlátozott gondolkodás.
 * Megszakadt vagy feldolgozhatatlan válasznál egyszer újrapróbál (nagyobb
 * kerettel); az API-hibákat (hálózat, kvóta, túlterhelés) továbbdobja.
 */
export async function requestPlanDraft(userPrompt: string, label: string): Promise<PlanDraft> {
  let lastProblems: string[] = [];

  for (let attempt = 1; attempt <= PLAN_MAX_ATTEMPTS; attempt++) {
    const retry = attempt > 1;
    const maxOutputTokens = retry
      ? GEMINI_WEEK_PLAN_RETRY_MAX_OUTPUT_TOKENS
      : GEMINI_WEEK_PLAN_MAX_OUTPUT_TOKENS;
    const thinkingBudget = retry
      ? GEMINI_WEEK_PLAN_RETRY_THINKING_BUDGET
      : GEMINI_WEEK_PLAN_THINKING_BUDGET;

    const { text, finishReason, usageMetadata } = await geminiGenerateContentRestDetailed({
      model: GEMINI_PLANNER_MODEL,
      systemInstruction: WEEK_PLAN_SYSTEM_PROMPT,
      userPrompt,
      generationConfig: {
        temperature: retry ? 0.5 : 0.7,
        maxOutputTokens,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget },
      },
      logContext: `weekly-plan/${label}-${attempt}`,
      maxAttempts: 1,
    });

    console.log(
      "[weekly-plan]",
      JSON.stringify({
        label,
        attempt,
        finishReason,
        maxOutputTokens,
        thinkingBudget,
        ...usageForLog(usageMetadata),
      })
    );

    if (isGeminiOutputTruncated(finishReason)) {
      lastProblems = [`A Gemini válasza a kimeneti korlátnál megszakadt (${finishReason}).`];
      continue;
    }
    try {
      return parsePlanJson(text);
    } catch (error) {
      if (!(error instanceof PlanParseError)) throw error;
      lastProblems = error.problems;
    }
  }

  throw new WeeklyPlanGenerationError(
    "A Gemini nem adott feldolgozható heti tervet. Próbáld újra.",
    lastProblems
  );
}

/** A vázlat a tervvé alakítás nélkül is ellenőrizhető: ismétlődések listája. */
export function draftProblems(
  plan: WeeklyPlan,
  registry: PlanRegistry
): string[] {
  const conflicts = findPlanConflicts(plan, registry);
  const overrides = new Set(plan.repeatOverrides ?? []);
  return [
    ...conflicts.internal.map(
      (c) => `${c.date}: az igehely (${c.verse}) ugyanaz, mint ${c.sameAs} napján — cserélni kell.`
    ),
    ...conflicts.registry
      .filter((c) => !overrides.has(c.date))
      .map(
        (c) =>
          `${c.date}: az igehely (${c.verse}) már szerepelt ${c.previous.date} napján („${c.previous.title}”) — cserélni kell.`
      ),
  ];
}

/**
 * Egyetlen automatikus javító kör: ha a vázlatban ismétlődő igehely van (a
 * terven belül vagy a 90 napos nyilvántartással szemben), a Gemini kicseréli a
 * problémás napokat. Ha a javítás nem sikerül, az eredeti vázlat marad — a
 * maradék ismétlődést a jóváhagyás úgyis jelzi.
 */
export async function repairDraftOnce(params: {
  weekId: string;
  draft: PlanDraft;
  problems: string[];
  registry: PlanRegistry;
}): Promise<{ draft: PlanDraft; repaired: boolean }> {
  try {
    const repaired = await requestPlanDraft(
      buildRepairUserPrompt({
        weekId: params.weekId,
        candidateJson: JSON.stringify(params.draft, null, 2),
        problems: params.problems,
        registry: params.registry,
      }),
      "repair"
    );
    return { draft: repaired, repaired: true };
  } catch (error) {
    // A javítás best-effort: bármilyen Gemini-/feldolgozási hiba esetén az eredeti vázlat marad
    // (a maradék ismétlődést a jóváhagyás úgyis jelzi). Tárolóhibát továbbdobunk.
    if (isAnyStorageError(error)) throw error;
    console.warn("[weekly-plan] a javító kör sikertelen — az eredeti vázlat marad:", error instanceof Error ? error.message : error);
    return { draft: params.draft, repaired: false };
  }
}
