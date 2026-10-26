import { addDaysToIsoDate } from "../app-date";
import { isPublicStatus } from "../devotional-status";
import { getDevotionalStorage } from "../storage";
import { getWeeklyPlanStore, type WeeklyPlanStore } from "../weekly-plan/store";
import { getWeekStart, type WeeklyPlan } from "../weekly-plan/types";
import { GENERATING_STALE_MS } from "../weekly-plan/ui-logic";
import { RESERVE_DAYS } from "./state";

/** Napi automatikus generálási kísérletek korlátja (egy nap szövegére, naptári naponként). */
export const MAX_DAILY_ATTEMPTS = 4;

export type CoverageState =
  /** Van jóváhagyott (nyilvánosságra kész) áhítat. */
  | "covered"
  /** Az autopilot tervének kész szövege jóváhagyásra vár — az autopilot jóváhagyja. */
  | "pending-approval"
  /** Készül (másik futás vagy kézi indítás). */
  | "in-progress"
  /** Az autopilot tervében van a nap, de még nincs szöveg. */
  | "missing"
  /** Az aznapi automatikus kísérletek kimerültek. */
  | "exhausted"
  /** Nincs heti terv erre a hétre — az autopilot létrehozza. */
  | "no-plan"
  /** Kézi (nem autopilot) terv kezeli — az autopilot nem nyúl hozzá. */
  | "manual-plan"
  /** A napnak kézi / napi folyamatból származó, még nem nyilvános rekordja van — nem nyúlunk hozzá. */
  | "manual-record";

export interface DayCoverage {
  date: string;
  state: CoverageState;
  weekId: string;
  planSource?: string;
  detail?: string;
}

/** A mai nap és a következő `horizon` nap: hol tart az előre elkészített tartalék. */
export async function computeCoverage(params: {
  today: string;
  horizon?: number;
  now?: Date;
  store?: WeeklyPlanStore;
}): Promise<DayCoverage[]> {
  const horizon = params.horizon ?? RESERVE_DAYS;
  const store = params.store ?? getWeeklyPlanStore();
  const now = params.now ?? new Date();
  const dates = Array.from({ length: horizon + 1 }, (_, i) => addDaysToIsoDate(params.today, i));

  const storage = getDevotionalStorage();
  const records = storage.listAdminEntries
    ? (await storage.listAdminEntries(params.today)).filter((e) => dates.includes(e.date))
    : await storage.getDevotionalsByDates(dates);

  const plans = new Map<string, WeeklyPlan | null>();
  for (const date of dates) {
    const weekId = getWeekStart(date);
    if (!plans.has(weekId)) plans.set(weekId, await store.getPlan(weekId));
  }

  return dates.map((date): DayCoverage => {
    const weekId = getWeekStart(date);
    const plan = plans.get(weekId) ?? null;
    const base = { date, weekId, planSource: plan?.source };
    const record = records.find((r) => r.date === date);

    if (record) {
      if (isPublicStatus(record.status, record.weekId)) return { ...base, state: "covered" };
      const autoPlan = plan?.status === "approved" && plan.source === "auto";
      if (record.weekId && autoPlan && !record.lastApiError) {
        const hold = plan?.days.find((d) => d.date === date)?.manualHold;
        if (hold) {
          return { ...base, state: "manual-record", detail: "Kézi kezelés alatt — jóváhagyásra vár a heti műhelyben." };
        }
        return { ...base, state: "pending-approval" };
      }
      return { ...base, state: "manual-record", detail: `Rekord (${record.status}) — nem nyúlunk hozzá.` };
    }

    if (!plan) return { ...base, state: "no-plan" };
    if (plan.status !== "approved" || plan.source !== "auto") {
      return {
        ...base,
        state: "manual-plan",
        detail: plan.status !== "approved" ? "Kézi terv vázlat." : "Kézi terv — az autopilot nem nyúl hozzá.",
      };
    }

    const day = plan.days.find((d) => d.date === date);
    if (!day) return { ...base, state: "no-plan" };
    if (
      day.state === "generating" &&
      day.lastAttemptAt &&
      now.getTime() - Date.parse(day.lastAttemptAt) < GENERATING_STALE_MS
    ) {
      return { ...base, state: "in-progress" };
    }
    if (day.autoAttemptsDate === params.today && (day.autoAttempts ?? 0) >= MAX_DAILY_ATTEMPTS) {
      return { ...base, state: "exhausted", detail: day.error };
    }
    return { ...base, state: "missing", detail: day.error };
  });
}

/** Hány egymást követő nap kész a holnaptól számítva. */
export function reserveDaysFrom(coverage: DayCoverage[]): number {
  let count = 0;
  for (const day of coverage.slice(1)) {
    if (day.state !== "covered") break;
    count++;
  }
  return count;
}
