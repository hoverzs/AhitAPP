import { appendVersionSnapshot } from "../devotional-versions";
import { getDevotionalByDate, upsertDevotional } from "../devotionals";
import type { Devotional } from "../types";
import { createDevotionalBackup, readDevotionalBackup } from "./backups";
import { DayBusyError, WeeklyPlanInputError, WeeklyPlanLockedError } from "./errors";
import { assertWeekEditable } from "./service";
import { getWeeklyPlanStore, type WeeklyPlanStore } from "./store";
import { GENERATING_STALE_MS } from "./ui-logic";
import type { DayReplacement, WeeklyPlan, WeeklyPlanDay } from "./types";

/**
 * Másik forrásból (napi folyamat) származó áhítat biztonságos kiváltása a
 * heti rendszerben — három külön, kifejezett lépésben:
 *
 * 1. `prepareReplacement`: teljes biztonsági mentés a régi rekordról. Semmit nem
 *    módosít és nem rejt el: a régi áhítat továbbra is élő.
 * 2. generálás `replace: true` móddal (day-generation): az ÚJ szöveg előbb
 *    elkészül és ellenőrzést kap, csak siker esetén cseréli le a régit (a régi
 *    szöveg a verziótörténetbe is bekerül). Hiba esetén a régi érintetlen.
 *    A csere után az új áhítat ellenőrzésre vár, amíg jóvá nem hagyják.
 * 3. `restoreReplaced`: a mentett régi áhítat visszaállítása (kifejezett
 *    megerősítéssel), az új szöveg a verziótörténetben megmarad.
 */

function storeOf(store?: WeeklyPlanStore): WeeklyPlanStore {
  return store ?? getWeeklyPlanStore();
}

function isLiveGenerating(day: WeeklyPlanDay, now: Date): boolean {
  if (day.state !== "generating") return false;
  const started = day.lastAttemptAt ? Date.parse(day.lastAttemptAt) : 0;
  return now.getTime() - started < GENERATING_STALE_MS;
}

function requireDay(plan: WeeklyPlan | null, date: string): { plan: WeeklyPlan; day: WeeklyPlanDay } {
  if (!plan) throw new WeeklyPlanInputError("Erre a hétre nincs terv.");
  const day = plan.days.find((d) => d.date === date);
  if (!day) throw new WeeklyPlanInputError(`A(z) ${date} nap nem tartozik ehhez a héthez.`);
  return { plan, day };
}

export interface PrepareReplacementResult {
  plan: WeeklyPlan;
  replacement: DayReplacement;
  /** true: ugyanerről a rekordról már volt mentés — nem készült újabb. */
  reused: boolean;
}

export async function prepareReplacement(
  params: { weekId: string; date: string; today?: string; now?: () => Date },
  store?: WeeklyPlanStore
): Promise<PrepareReplacementResult> {
  const s = storeOf(store);
  const now = params.now ?? (() => new Date());
  assertWeekEditable(params.weekId, params.today);

  const { plan, day } = requireDay(await s.getPlan(params.weekId), params.date);
  if (plan.status !== "approved") {
    throw new WeeklyPlanLockedError("A csere előkészítéséhez előbb hagyd jóvá a heti tervet.");
  }
  if (isLiveGenerating(day, now())) throw new DayBusyError(day.date);

  const existing = await getDevotionalByDate(params.date);
  if (!existing) {
    throw new WeeklyPlanInputError("Ezen a napon nincs áhítat — nincs mit kiváltani, generáld a napot normál módon.");
  }
  if (existing.weekId) {
    throw new WeeklyPlanInputError(
      existing.weekId === params.weekId
        ? "Ez az áhítat már a heti sorozat része."
        : "Ez az áhítat másik heti sorozathoz tartozik."
    );
  }

  const current = day.replacement;
  if (current && !current.executedAt && current.recordUpdatedAt === existing.updatedAt) {
    return { plan, replacement: current, reused: true };
  }
  if (current?.executedAt) {
    throw new WeeklyPlanLockedError("Ez a nap már ki lett váltva — a visszaállítás a „Régi áhítat visszaállítása” művelettel lehetséges.");
  }

  // A teljes régi rekord mentése ELŐSZÖR — a terv csak a sikeres mentés után hivatkozik rá.
  const created = await createDevotionalBackup(existing, "weekly_replacement_prepare", now());
  const replacement: DayReplacement = {
    backupId: created.id,
    backupPath: created.path,
    previousStatus: existing.status ?? "published",
    previousTitle: existing.title,
    recordUpdatedAt: existing.updatedAt ?? existing.createdAt,
    preparedAt: now().toISOString(),
  };
  const updated = await s.updatePlan(params.weekId, (live) => ({
    ...live,
    days: live.days.map((d) => (d.date === params.date ? { ...d, replacement } : d)),
  }));
  return { plan: updated, replacement, reused: false };
}

export interface RestoreResult {
  plan: WeeklyPlan;
  devotional: Devotional;
  /** Honnan állt vissza: a mentésből (teljes rekord) vagy csak a verziótörténetből (szöveg). */
  source: "backup" | "version-history";
}

export async function restoreReplaced(
  params: { weekId: string; date: string; confirm?: boolean; today?: string; now?: () => Date },
  store?: WeeklyPlanStore
): Promise<RestoreResult> {
  const s = storeOf(store);
  const now = params.now ?? (() => new Date());
  assertWeekEditable(params.weekId, params.today);
  if (params.confirm !== true) {
    throw new WeeklyPlanInputError("A visszaállításhoz kifejezett megerősítés kell (confirm).");
  }

  const { day } = requireDay(await s.getPlan(params.weekId), params.date);
  const replacement = day.replacement;
  if (!replacement?.executedAt) {
    throw new WeeklyPlanInputError("Ezen a napon nincs végrehajtott csere, nincs mit visszaállítani.");
  }
  if (isLiveGenerating(day, now())) throw new DayBusyError(day.date);

  const current = await getDevotionalByDate(params.date);
  if (!current || current.weekId !== params.weekId) {
    throw new WeeklyPlanInputError("A jelenlegi áhítat nem ebből a heti tervből származik — a visszaállítás nem biztonságos.");
  }

  const backup = await readDevotionalBackup(replacement.backupPath);
  let restored: Devotional;
  let source: RestoreResult["source"];
  // A jelenlegi (heti) szöveg a verziótörténetben marad, hogy a visszaállítás is visszavonható legyen.
  const history = appendVersionSnapshot(current, "weekly_replacement");

  if (backup) {
    const { weekId: _weekId, ...legacy } = backup.record;
    void _weekId;
    restored = { ...legacy, versionHistory: history, updatedAt: now().toISOString() };
    source = "backup";
  } else {
    // Tartalék: a csere pillanatában a verziótörténetbe mentett régi szöveg (a kép marad a jelenlegi).
    const snapshot = [...(current.versionHistory ?? [])]
      .reverse()
      .find((v) => v.reason === "weekly_replacement");
    if (!snapshot) {
      throw new WeeklyPlanInputError("A biztonsági mentés nem olvasható, és verziótörténeti másolat sincs.");
    }
    const { weekId: _weekId, ...withoutWeek } = current;
    void _weekId;
    restored = {
      ...withoutWeek,
      title: snapshot.title,
      verse: snapshot.verse,
      content: snapshot.content,
      prayer: snapshot.prayer,
      reflectionQuestion: snapshot.reflectionQuestion,
      facebookCopy: snapshot.facebookCopy,
      status: (snapshot.status as Devotional["status"]) ?? (replacement.previousStatus as Devotional["status"]),
      versionHistory: history,
      updatedAt: now().toISOString(),
    };
    source = "version-history";
  }

  const saved = await upsertDevotional(restored, { weeklyFlow: true, keepReplacedImage: true });
  const plan = await s.updatePlan(params.weekId, (live) => ({
    ...live,
    days: live.days.map((d) =>
      d.date === params.date
        ? { ...d, state: "planned", error: undefined, lastAttemptAt: undefined, replacement: undefined }
        : d
    ),
  }));
  return { plan, devotional: saved, source };
}
