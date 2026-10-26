import { getWeekStart } from "./types";
import { ManagedByWeeklyPlanError } from "./errors";
import { getWeeklyPlanStore, WeeklyPlanUnsupportedError } from "./store";

export interface ManagingPlan {
  weekId: string;
  date: string;
}

/**
 * A dátumot jóváhagyott heti terv kezeli-e. Csak a JÓVÁHAGYOTT terv számít:
 * a vázlat még nem kötelezi a napi folyamatot. A tárolóhibát nem nyeljük el —
 * a hívó (cron) inkább hibával áll meg és újrapróbál, mintsem versengő
 * generálást indítson. Az olyan meghajtón, ahol nincs heti terv (Redis), a
 * dátum nem kezelt.
 */
export async function getManagingPlan(date: string): Promise<ManagingPlan | null> {
  let store;
  try {
    store = getWeeklyPlanStore();
  } catch (error) {
    if (error instanceof WeeklyPlanUnsupportedError) return null;
    throw error;
  }
  const weekId = getWeekStart(date);
  const plan = await store.getPlan(weekId);
  if (!plan || plan.status !== "approved") return null;
  if (!plan.days.some((d) => d.date === date)) return null;
  return { weekId, date };
}

/** Kivétel (ManagedByWeeklyPlanError), ha a dátumot jóváhagyott heti terv kezeli. */
export async function assertNotManagedByWeeklyPlan(date: string): Promise<void> {
  const managing = await getManagingPlan(date);
  if (managing) {
    console.warn(
      `[weekly-plan] a napi generálás kihagyva: ${date} — jóváhagyott heti terv kezeli (${managing.weekId})`
    );
    throw new ManagedByWeeklyPlanError(date, managing.weekId);
  }
}
