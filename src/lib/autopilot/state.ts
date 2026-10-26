import { mutateJsonDocument } from "../storage/blob/json-cas";
import { getWeeklyJsonClient, WeeklyPlanUnsupportedError } from "../weekly-plan/store";

/**
 * Az autopilot állapota egyetlen kis Blob-dokumentumban (`autopilot.json`):
 * kapcsoló, futási zár és az utolsó futások rövid összefoglalója.
 */
export const AUTOPILOT_PATH = "autopilot.json";

/** Ennyi nappal előre (a mai nap mellett) legyen mindig kész, jóváhagyott áhítat. */
export const RESERVE_DAYS = 3;

/** Egy futási zár ennyi idő után elakadtnak számít (a futás max. 5 perc). */
export const LOCK_STALE_MS = 12 * 60 * 1000;

export type AutopilotOutcome = "ok" | "partial" | "stopped" | "failed" | "busy" | "disabled";

export interface AutopilotRunSummary {
  startedAt: string;
  finishedAt: string;
  trigger: string;
  outcome: AutopilotOutcome;
  /** Rövid, olvasható események (legfeljebb 20): mit csinált / mit hagyott ki és miért. */
  events: string[];
  plansCreated: number;
  generated: number;
  approved: number;
  failures: number;
  /** Hány egymást követő nap kész a holnaptól számítva (0–RESERVE_DAYS). */
  reserveDays: number;
  todayCovered: boolean;
  tomorrowCovered: boolean;
}

export interface AutopilotState {
  version: 1;
  /** Alapértelmezés: kikapcsolva — a telepítés önmagában semmit nem változtat. */
  enabled: boolean;
  enabledAt?: string;
  updatedAt: string;
  runningSince?: string;
  lastRun?: AutopilotRunSummary;
  recentRuns: AutopilotRunSummary[];
}

export function defaultAutopilotState(now: Date = new Date()): AutopilotState {
  return { version: 1, enabled: false, updatedAt: now.toISOString(), recentRuns: [] };
}

function parseState(text: string): AutopilotState | null {
  try {
    const parsed = JSON.parse(text) as AutopilotState;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) return null;
    return { ...defaultAutopilotState(), ...parsed, recentRuns: parsed.recentRuns ?? [] };
  } catch {
    return null;
  }
}

export async function readAutopilotState(): Promise<AutopilotState> {
  const current = await getWeeklyJsonClient().getText(AUTOPILOT_PATH, { fresh: true });
  return (current ? parseState(current.text) : null) ?? defaultAutopilotState();
}

/**
 * Be van-e kapcsolva. Hibánál (nem támogatott meghajtó, olvasási hiba) false:
 * ilyenkor a régi napi folyamat marad az érvényes működés.
 */
export async function isAutopilotEnabled(): Promise<boolean> {
  try {
    return (await readAutopilotState()).enabled;
  } catch (error) {
    if (!(error instanceof WeeklyPlanUnsupportedError)) {
      console.warn("[autopilot] az állapot olvasása sikertelen — kikapcsoltnak tekintjük:", error);
    }
    return false;
  }
}

async function mutateState(
  mutate: (state: AutopilotState) => AutopilotState,
  now: Date = new Date()
): Promise<AutopilotState> {
  return mutateJsonDocument(getWeeklyJsonClient(), AUTOPILOT_PATH, parseState, (current) => {
    const next = mutate(current ?? defaultAutopilotState(now));
    return { ...next, updatedAt: now.toISOString() };
  });
}

export function setAutopilotEnabled(enabled: boolean, now: Date = new Date()): Promise<AutopilotState> {
  return mutateState(
    (state) => ({
      ...state,
      enabled,
      enabledAt: enabled ? (state.enabled ? state.enabledAt : now.toISOString()) : state.enabledAt,
    }),
    now
  );
}

/**
 * Futási zár: az ütközésbiztos mentés miatt egyszerre csak egy futás kapja meg
 * (cron, admin gomb, párhuzamos hívás). Az elakadt zárat a határidő után felülírjuk.
 */
export async function acquireRunLock(
  now: Date
): Promise<{ acquired: boolean; state: AutopilotState }> {
  let acquired = false;
  const state = await mutateState((current) => {
    const since = current.runningSince ? Date.parse(current.runningSince) : 0;
    const busy = since > 0 && now.getTime() - since < LOCK_STALE_MS;
    acquired = !busy;
    return busy ? current : { ...current, runningSince: now.toISOString() };
  }, now);
  return { acquired, state };
}

export function finishRun(summary: AutopilotRunSummary, now: Date = new Date()): Promise<AutopilotState> {
  return mutateState(
    (state) => ({
      ...state,
      runningSince: undefined,
      lastRun: summary,
      recentRuns: [summary, ...state.recentRuns].slice(0, 5),
    }),
    now
  );
}
