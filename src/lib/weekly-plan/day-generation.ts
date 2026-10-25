import { buildDevotionalMemory } from "../devotional-memory";
import { buildDevotionalFromPlan } from "../generate-devotional";
import {
  appendDevotional,
  getDevotionalByDate,
  updateDevotionalStatus,
  upsertDevotional,
} from "../devotionals";
import { TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE } from "../devotional-text-complete";
import { appendVersionSnapshot } from "../devotional-versions";
import { toGeminiErrorDetails } from "../gemini-errors";
import { fetchDevotionalMarkdown } from "../gemini-planner";
import { assemblePlannedDayFromParts } from "../planned-day-mapper";
import type { Devotional, DynamicPlannedDay } from "../types";
import {
  DayAlreadyReadyError,
  DayBusyError,
  DayConflictError,
  DayIncompleteError,
  WeeklyPlanInputError,
  WeeklyPlanLockedError,
} from "./errors";
import { buildDayExtraContext } from "./prompts";
import { assertWeekEditable } from "./service";
import { getWeeklyPlanStore, type WeeklyPlanStore } from "./store";
import type { WeeklyPlan, WeeklyPlanDay } from "./types";

/** Egy „generating” állapot ennyi ideig számít élőnek (a futás max. 5 perc); utána elakadtnak vesszük. */
export const GENERATING_STALE_MS = 10 * 60 * 1000;

const ERROR_MAX_CHARS = 300;

function storeOf(store?: WeeklyPlanStore): WeeklyPlanStore {
  return store ?? getWeeklyPlanStore();
}

function isLiveGenerating(day: WeeklyPlanDay, now: Date): boolean {
  if (day.state !== "generating") return false;
  const started = day.lastAttemptAt ? Date.parse(day.lastAttemptAt) : 0;
  return now.getTime() - started < GENERATING_STALE_MS;
}

function isCompleteRecord(d: Devotional): boolean {
  return Boolean(d.content?.trim()) && d.lastApiError !== TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE;
}

/** Egy nap állapotának módosítása — csak az adott nap változik, a többi nap és a szöveg érintetlen. */
async function setDayState(
  store: WeeklyPlanStore,
  weekId: string,
  date: string,
  change: (day: WeeklyPlanDay) => WeeklyPlanDay
): Promise<WeeklyPlan> {
  return store.updatePlan(weekId, (live) => ({
    ...live,
    days: live.days.map((d) => (d.date === date ? change(d) : d)),
  }));
}

/** A nap tervéből a (nem módosított) szöveg-prompttal elkészített, még nem mentett áhítat-terv. */
async function generatePlannedDay(plan: WeeklyPlan, day: WeeklyPlanDay): Promise<DynamicPlannedDay> {
  const metadata = {
    title: day.title,
    scripture: day.verse,
    category: day.category || "Áhítat",
    excerpt: day.excerpt || day.title,
    imageKeywords: day.imageKeywords,
  };
  const body = await fetchDevotionalMarkdown(
    metadata,
    buildDevotionalMemory([], { targetDate: day.date }),
    { extraContext: buildDayExtraContext(plan, day.date) }
  );
  const planned = assemblePlannedDayFromParts({
    title: day.title,
    scripture: day.verse,
    category: metadata.category,
    excerpt: metadata.excerpt,
    devotionalMarkdown: body.markdown,
    imageKeywords: day.imageKeywords,
  });
  return {
    ...planned,
    textComplete: body.textComplete,
    generationReviewMessage: body.textComplete ? undefined : TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE,
    generationDiagnostics: body.generationDiagnostics,
  };
}

export interface GenerateDayResult {
  plan: WeeklyPlan;
  devotional: Devotional;
  /** true: a szöveg már megvolt (korábbi, megszakadt futásból) — nem hívtuk a Geminit. */
  reconciled: boolean;
  regenerated: boolean;
}

/**
 * Egy nap áhítatának generálása a jóváhagyott tervből. Folytatható és
 * önálló: a sikertelen nap csak a saját állapotát (failed + hiba) érinti, a
 * már elkészült szövegek érintetlenek. Hiányos szöveget nem ment.
 */
export async function generateWeekDay(
  params: { weekId: string; date: string; force?: boolean; today?: string; now?: () => Date },
  store?: WeeklyPlanStore
): Promise<GenerateDayResult> {
  const s = storeOf(store);
  const now = params.now ?? (() => new Date());
  assertWeekEditable(params.weekId, params.today);

  const plan = await s.getPlan(params.weekId);
  if (!plan) throw new WeeklyPlanInputError("Erre a hétre nincs terv.");
  if (plan.status !== "approved") {
    throw new WeeklyPlanLockedError("A napok generálásához előbb hagyd jóvá a heti tervet.");
  }
  const day = plan.days.find((d) => d.date === params.date);
  if (!day) throw new WeeklyPlanInputError(`A(z) ${params.date} nap nem tartozik ehhez a héthez.`);
  const force = params.force === true;

  if (isLiveGenerating(day, now())) throw new DayBusyError(day.date);
  if (day.state === "ready" && !force) throw new DayAlreadyReadyError(day.date);

  const existing = await getDevotionalByDate(day.date);
  if (existing && existing.weekId !== params.weekId) {
    throw new DayConflictError(day.date, existing.status ?? "published");
  }

  // Egy korábbi, félbeszakadt futásból már megvan a teljes szöveg: nem hívjuk újra a Geminit.
  if (existing && !force && isCompleteRecord(existing)) {
    const updated = await setDayState(s, params.weekId, day.date, (d) => ({
      ...d,
      state: "ready",
      error: undefined,
    }));
    return { plan: updated, devotional: existing, reconciled: true, regenerated: false };
  }

  // Foglalás: az ütközésbiztos mentés kizárja a párhuzamos kettős indítást.
  const startedAt = now().toISOString();
  await s.updatePlan(params.weekId, (live) => {
    const liveDay = live.days.find((d) => d.date === day.date)!;
    if (isLiveGenerating(liveDay, now())) throw new DayBusyError(day.date);
    // Közben egy másik kérés már elkészítette a napot: ne generáljuk újra.
    if (liveDay.state === "ready" && !force) throw new DayAlreadyReadyError(day.date);
    return {
      ...live,
      days: live.days.map((d) =>
        d.date === day.date
          ? { ...d, state: "generating", lastAttemptAt: startedAt, error: undefined }
          : d
      ),
    };
  });

  try {
    const planned = await generatePlannedDay(plan, day);
    if (planned.textComplete !== true) throw new DayIncompleteError(day.date);

    const regenerate = Boolean(existing); // azonos hétből származó (hiányos vagy kényszerített) rekord cseréje
    const devotional = await buildDevotionalFromPlan(
      planned,
      regenerate
        ? { action: "update", date: day.date, existing }
        : { action: "create", date: day.date },
      regenerate
        ? { existing, versionHistory: appendVersionSnapshot(existing!, "regenerate") }
        : undefined
    );
    devotional.date = day.date;
    devotional.weekId = params.weekId;
    // Szerkesztői kontroll: a friss szöveg mindig ellenőrzésre vár, amíg jóvá nem hagyják.
    devotional.status = "needs_review";
    devotional.lastApiError = undefined;

    const saved = regenerate ? await upsertDevotional(devotional) : await appendDevotional(devotional);
    const updated = await setDayState(s, params.weekId, day.date, (d) => ({
      ...d,
      state: "ready",
      error: undefined,
      lastAttemptAt: now().toISOString(),
    }));
    return { plan: updated, devotional: saved, reconciled: false, regenerated: regenerate };
  } catch (error) {
    const message = (
      error instanceof DayIncompleteError ? error.message : toGeminiErrorDetails(error).message
    ).slice(0, ERROR_MAX_CHARS);
    try {
      await setDayState(s, params.weekId, day.date, (d) => ({
        ...d,
        state: "failed",
        error: message,
        lastAttemptAt: now().toISOString(),
      }));
    } catch (stateError) {
      console.error("[weekly-plan] a napi hibaállapot mentése sikertelen:", stateError);
    }
    throw error;
  }
}

export interface ApprovalOutcome {
  changed: string[];
  skipped: { date: string; reason: string }[];
}

/**
 * A hét elkészült áhítatainak jóváhagyása (vagy visszavonása). A jóváhagyott
 * áhítat a saját napján magától megjelenik; a visszavont (needs_review) nem.
 */
export async function setWeekDevotionalApproval(
  params: {
    weekId: string;
    approve: boolean;
    dates?: string[];
    today?: string;
  },
  store?: WeeklyPlanStore
): Promise<ApprovalOutcome> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const plan = await s.getPlan(params.weekId);
  if (!plan) throw new WeeklyPlanInputError("Erre a hétre nincs terv.");
  if (plan.status !== "approved") {
    throw new WeeklyPlanLockedError("Az áhítatok jóváhagyásához előbb hagyd jóvá a heti tervet.");
  }
  const weekDates = new Set(plan.days.map((d) => d.date));
  const targets = params.dates?.length ? [...new Set(params.dates)] : [...weekDates].sort();
  for (const date of targets) {
    if (!weekDates.has(date)) {
      throw new WeeklyPlanInputError(`A(z) ${date} nap nem tartozik ehhez a héthez.`);
    }
  }

  const outcome: ApprovalOutcome = { changed: [], skipped: [] };
  for (const date of targets) {
    const record = await getDevotionalByDate(date);
    const skip = (reason: string) => outcome.skipped.push({ date, reason });

    if (!record) skip("Még nincs elkészült szöveg.");
    else if (record.weekId !== params.weekId) skip("Az áhítat nem ebből a tervből származik.");
    else if (params.approve) {
      if (!isCompleteRecord(record)) skip("A szöveg hiányos — javítsd vagy generáld újra.");
      else if (record.status === "approved" || record.status === "published") skip("Már jóváhagyott.");
      else {
        await updateDevotionalStatus(date, "approved");
        outcome.changed.push(date);
      }
    } else if (record.status !== "approved") {
      skip("Nincs jóváhagyva.");
    } else {
      await updateDevotionalStatus(date, "needs_review");
      outcome.changed.push(date);
    }
  }
  return outcome;
}
