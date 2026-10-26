import { getAppTodayIso } from "../app-date";
import { isAnyStorageError } from "../storage";
import {
  DayAlreadyReadyError,
  DayBusyError,
  DayConflictError,
  WeeklyPlanConflictError,
} from "../weekly-plan/errors";
import { describeDayFailure, generateWeekDay, setWeekDevotionalApproval } from "../weekly-plan/day-generation";
import {
  approvePlan,
  deletePlanDraft,
  proposePlan,
  readEffectiveRegistry,
} from "../weekly-plan/service";
import { getWeeklyPlanStore, WeeklyPlanExistsError, type WeeklyPlanStore } from "../weekly-plan/store";
import { findPlanConflicts } from "../weekly-plan/types";
import {
  computeCoverage,
  MAX_DAILY_ATTEMPTS,
  reserveDaysFrom,
  type DayCoverage,
} from "./coverage";
import {
  acquireRunLock,
  finishRun,
  readAutopilotState,
  type AutopilotOutcome,
  type AutopilotRunSummary,
} from "./state";

/** Egy futás időkerete (a függvény 300 mp-es korlátja alatt) és egy Gemini-lépés becsült hossza. */
const DEFAULT_BUDGET_MS = 230_000;
const STEP_RESERVE_MS = 75_000;
/** Futásonként legfeljebb ennyi napot generál (a többit a következő futás pótolja). */
const DEFAULT_MAX_DAY_GENERATIONS = 2;
const MAX_CONSECUTIVE_FAILURES = 2;
const MAX_EVENTS = 20;

export interface AutopilotRunOptions {
  trigger: "cron" | "admin" | "test";
  now?: () => Date;
  /** Csak teszteléshez: a „ma” felülbírálása. */
  today?: string;
  budgetMs?: number;
  maxDayGenerations?: number;
  store?: WeeklyPlanStore;
}

function summarize(
  base: Pick<AutopilotRunSummary, "startedAt" | "trigger">,
  outcome: AutopilotOutcome,
  now: Date,
  events: string[],
  counters: Partial<AutopilotRunSummary>
): AutopilotRunSummary {
  return {
    ...base,
    finishedAt: now.toISOString(),
    outcome,
    events: events.slice(0, MAX_EVENTS),
    plansCreated: 0,
    generated: 0,
    approved: 0,
    failures: 0,
    reserveDays: 0,
    todayCovered: false,
    tomorrowCovered: false,
    ...counters,
  };
}

/**
 * Az autopilot egy futása: a mai nap és a következő RESERVE_DAYS nap
 * áhítatainak biztosítása. Idempotens és korlátos — ha nincs mit pótolni,
 * Gemini-hívás nélkül lefut.
 *
 * Védelmek: egyszerre egy futás (Blob-zár), kézi tervhez és kézi / napi
 * rekordhoz nem nyúl, hiányos szöveget nem ment és nem hagy jóvá, napi
 * kísérletkorlát, két egymást követő hiba után megáll, a kapcsoló futás közben
 * is érvényes.
 */
export async function runAutopilot(options: AutopilotRunOptions): Promise<AutopilotRunSummary> {
  const clock = options.now ?? (() => new Date());
  const started = clock();
  const base = { startedAt: started.toISOString(), trigger: options.trigger };
  const store = options.store ?? getWeeklyPlanStore();
  const today = options.today ?? getAppTodayIso(started);
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxGenerations = options.maxDayGenerations ?? DEFAULT_MAX_DAY_GENERATIONS;

  const initial = await readAutopilotState();
  if (!initial.enabled) {
    return summarize(base, "disabled", clock(), ["Az autopilot ki van kapcsolva."], {});
  }

  const lock = await acquireRunLock(started);
  if (!lock.acquired) {
    return summarize(base, "busy", clock(), ["Másik futás van folyamatban — kihagyva."], {});
  }

  const events: string[] = [];
  const counters = { plansCreated: 0, generated: 0, approved: 0, failures: 0 };
  let outcome: AutopilotOutcome = "ok";
  let coverage: DayCoverage[] = [];

  const elapsed = () => clock().getTime() - started.getTime();
  const hasTime = () => elapsed() + STEP_RESERVE_MS <= budgetMs;
  const stillEnabled = async () => (await readAutopilotState()).enabled;
  const note = (message: string) => {
    if (events.length < MAX_EVENTS) events.push(message);
    console.log(`[autopilot] ${message}`);
  };

  try {
    coverage = await computeCoverage({ today, now: started, store });
    let consecutiveFailures = 0;
    let stopReason: string | null = null;

    for (const day of coverage) {
      if (!["no-plan", "missing", "pending-approval"].includes(day.state)) {
        if (day.state === "manual-plan" || day.state === "manual-record" || day.state === "exhausted") {
          note(`${day.date}: ${day.state === "exhausted" ? "az aznapi próbálkozások kimerültek" : (day.detail ?? day.state)}`);
        }
        continue;
      }
      if (stopReason) break;
      if (!hasTime()) {
        stopReason = "elfogyott az időkeret — a többit a következő futás pótolja";
        break;
      }
      if (counters.generated >= maxGenerations && day.state !== "pending-approval") {
        stopReason = `a futásonkénti ${maxGenerations} nap elkészült — a többi a következő futásra marad`;
        break;
      }

      try {
        let state = day.state;

        if (state === "no-plan") {
          const created = await ensureAutoPlan(store, day.weekId, today, note);
          if (created.created) counters.plansCreated++;
          if (!created.ready) {
            consecutiveFailures++;
            counters.failures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) stopReason = "két egymást követő hiba — megállok";
            continue;
          }
          state = "missing";
          if (!(await stillEnabled())) {
            stopReason = "az autopilotot közben kikapcsolták";
            break;
          }
        }

        if (state === "missing") {
          if (!hasTime()) {
            stopReason = "elfogyott az időkeret — a többit a következő futás pótolja";
            break;
          }
          const ok = await attemptDay(store, day, today, note);
          if (ok === "generated") {
            counters.generated++;
            consecutiveFailures = 0;
            if (await approveDay(day, today, note)) counters.approved++;
          } else if (ok === "failed") {
            counters.failures++;
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) stopReason = "két egymást követő hiba — megállok";
          }
          if (!(await stillEnabled())) stopReason = "az autopilotot közben kikapcsolták";
        } else if (state === "pending-approval") {
          if (await approveDay(day, today, note)) counters.approved++;
        }
      } catch (error) {
        if (isAnyStorageError(error)) throw error;
        counters.failures++;
        consecutiveFailures++;
        note(`${day.date}: váratlan hiba — ${describeDayFailure(error)}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) stopReason = "két egymást követő hiba — megállok";
      }
    }

    if (stopReason) {
      note(stopReason);
      outcome = counters.failures > 0 ? "partial" : "stopped";
    } else if (counters.failures > 0) {
      outcome = "partial";
    }
    coverage = await computeCoverage({ today, now: clock(), store });
  } catch (error) {
    outcome = "failed";
    note(`a futás megszakadt: ${describeDayFailure(error)}`);
    console.error("[autopilot] a futás hibával leállt:", error);
  }

  const summary = summarize(base, outcome, clock(), events, {
    ...counters,
    reserveDays: coverage.length ? reserveDaysFrom(coverage) : 0,
    todayCovered: coverage[0]?.state === "covered",
    tomorrowCovered: coverage[1]?.state === "covered",
  });
  try {
    await finishRun(summary, clock());
  } catch (error) {
    console.error("[autopilot] az állapot mentése sikertelen:", error);
  }
  return summary;
}

/**
 * A hét automatikus terve: ha még nincs, a Gemini megtervezi; ha egy korábbi
 * futásból autopilot-vázlat maradt, jóváhagyja. Kézi tervhez nem nyúl.
 */
async function ensureAutoPlan(
  store: WeeklyPlanStore,
  weekId: string,
  today: string,
  note: (message: string) => void
): Promise<{ ready: boolean; created: boolean }> {
  let created = false;
  let plan = await store.getPlan(weekId);

  if (plan && plan.source !== "auto") {
    note(`${weekId}: kézi terv van — nem nyúlok hozzá`);
    return { ready: false, created: false };
  }

  if (!plan) {
    try {
      const result = await proposePlan({ weekId, auto: true, today }, store);
      plan = result.plan;
      created = true;
      note(`${weekId}: automatikus heti terv készült („${plan.theme}”)${result.repaired ? " (igeismétlés javítva)" : ""}`);
    } catch (error) {
      if (error instanceof WeeklyPlanExistsError || error instanceof WeeklyPlanConflictError) {
        note(`${weekId}: közben másik folyamat már létrehozta a tervet`);
        plan = await store.getPlan(weekId);
      } else {
        if (isAnyStorageError(error)) throw error;
        note(`${weekId}: a tervezés sikertelen — ${describeDayFailure(error)}`);
        return { ready: false, created: false };
      }
    }
  }
  if (!plan || plan.source !== "auto") return { ready: false, created };
  if (plan.status === "approved") return { ready: true, created };

  // Autopilot-vázlat: jóváhagyás (a 90 napos ismétlést naplózottan elfogadja, a terven belülit nem).
  const registry = await readEffectiveRegistry(store, today);
  const conflicts = findPlanConflicts(plan, registry);
  if (conflicts.internal.length > 0) {
    note(`${weekId}: a tervben ismétlődő igehely maradt — a vázlatot elvetem, új tervet kérek`);
    await deletePlanDraft({ weekId, expectedUpdatedAt: plan.updatedAt, today }, store);
    return { ready: false, created };
  }
  const overrides = conflicts.registry.map((c) => c.date);
  if (overrides.length > 0) {
    note(`${weekId}: a 90 napon belüli igeismétlés elfogadva (${overrides.join(", ")})`);
  }
  try {
    await approvePlan({ weekId, expectedUpdatedAt: plan.updatedAt, overrideRepeats: overrides, today }, store);
    return { ready: true, created };
  } catch (error) {
    if (isAnyStorageError(error)) throw error;
    note(`${weekId}: a terv nem hagyható jóvá (${describeDayFailure(error)}) — a vázlatot elvetem`);
    const live = await store.getPlan(weekId);
    if (live && live.status === "draft" && live.source === "auto") {
      await deletePlanDraft({ weekId, expectedUpdatedAt: live.updatedAt, today }, store);
    }
    return { ready: false, created };
  }
}

/** Egy nap szövegének generálása a napi korláton belül. */
async function attemptDay(
  store: WeeklyPlanStore,
  day: DayCoverage,
  today: string,
  note: (message: string) => void
): Promise<"generated" | "failed" | "skipped"> {
  const plan = await store.getPlan(day.weekId);
  const planDay = plan?.days.find((d) => d.date === day.date);
  if (!plan || !planDay || plan.source !== "auto" || plan.status !== "approved") return "skipped";

  const attemptsToday = planDay.autoAttemptsDate === today ? (planDay.autoAttempts ?? 0) : 0;
  if (attemptsToday >= MAX_DAILY_ATTEMPTS) {
    note(`${day.date}: az aznapi ${MAX_DAILY_ATTEMPTS} kísérlet kimerült`);
    return "skipped";
  }

  // A kísérletet a hívás ELŐTT számoljuk: egy menet közben leálló futás is beleszámít.
  await store.updatePlan(day.weekId, (live) => ({
    ...live,
    days: live.days.map((d) =>
      d.date === day.date ? { ...d, autoAttempts: attemptsToday + 1, autoAttemptsDate: today } : d
    ),
  }));

  try {
    await generateWeekDay({ weekId: day.weekId, date: day.date, today, byAutopilot: true }, store);
    await store.updatePlan(day.weekId, (live) => ({
      ...live,
      days: live.days.map((d) => (d.date === day.date ? { ...d, autoAttempts: 0, autoAttemptsDate: today } : d)),
    }));
    note(`${day.date}: a szöveg elkészült`);
    return "generated";
  } catch (error) {
    if (isAnyStorageError(error)) throw error;
    if (error instanceof DayBusyError || error instanceof DayAlreadyReadyError) {
      note(`${day.date}: másik folyamat dolgozik rajta — kihagyva`);
      return "skipped";
    }
    if (error instanceof DayConflictError) {
      note(`${day.date}: közben másik áhítat keletkezett — kihagyva`);
      return "skipped";
    }
    note(`${day.date}: sikertelen (${attemptsToday + 1}/${MAX_DAILY_ATTEMPTS} kísérlet) — ${describeDayFailure(error)}`);
    return "failed";
  }
}

/** A kész, teljes szöveg jóváhagyása (a meglévő kapu: kész állapot, nem elavult, nem hiányos). */
async function approveDay(day: DayCoverage, today: string, note: (message: string) => void): Promise<boolean> {
  const outcome = await setWeekDevotionalApproval({
    weekId: day.weekId,
    approve: true,
    dates: [day.date],
    today,
  });
  if (outcome.changed.includes(day.date)) {
    note(`${day.date}: jóváhagyva — a saját napján megjelenik`);
    return true;
  }
  const reason = outcome.skipped[0]?.reason;
  if (reason) note(`${day.date}: nem hagyható jóvá automatikusan — ${reason}`);
  return false;
}
