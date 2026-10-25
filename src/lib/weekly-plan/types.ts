import { addDaysToIsoDate, isValidIsoDate } from "../app-date";
import { extractVerseReference, normalizeReference } from "../devotional-memory";

/**
 * Heti sorozat terve: téma, ív és hét nap (hétfőtől vasárnapig). Egyetlen,
 * szerkeszthető dokumentum — az AI-tervezés, a finomítás és a beillesztett
 * szerkesztői brief is ugyanehhez vezet.
 */

export const WEEK_LENGTH = 7;
export const WEEKLY_PLAN_VERSION = 1;

export type WeeklyPlanStatus = "draft" | "approved";
/** Honnan származik a terv: Gemini javaslat, beillesztett brief vagy kézi. */
export type WeeklyPlanSource = "gemini" | "brief" | "manual";
/**
 * planned: még nincs szöveg · generating: készül · ready: kész · failed: sikertelen ·
 * stale: van szöveg, de a terv ezen napja azóta megváltozott (újragenerálni kell).
 */
export type WeeklyPlanDayState = "planned" | "generating" | "ready" | "failed" | "stale";

export const WEEKLY_PLAN_STATUSES: WeeklyPlanStatus[] = ["draft", "approved"];
export const WEEKLY_PLAN_SOURCES: WeeklyPlanSource[] = ["gemini", "brief", "manual"];
export const WEEKLY_PLAN_DAY_STATES: WeeklyPlanDayState[] = [
  "planned",
  "generating",
  "ready",
  "failed",
  "stale",
];

export interface WeeklyPlanDay {
  /** A nap (YYYY-MM-DD) — megegyezik a belőle készülő áhítat azonosítójával. */
  date: string;
  title: string;
  /** Igehely hivatkozása (pl. „Zsoltárok 23:1-3”). */
  verse: string;
  /** A nap szerepe a heti ívben (egy mondat). */
  role: string;
  category: string;
  imageKeywords?: string;
  excerpt: string;
  state: WeeklyPlanDayState;
  error?: string;
  lastAttemptAt?: string;
}

export interface WeeklyPlan {
  version: typeof WEEKLY_PLAN_VERSION;
  /** A hét hétfője (YYYY-MM-DD). */
  weekId: string;
  theme: string;
  /** A heti gondolati ív rövid leírása. */
  arc: string;
  days: WeeklyPlanDay[];
  status: WeeklyPlanStatus;
  source: WeeklyPlanSource;
  /** A beillesztett szerkesztői brief vagy a rövid téma-kérés szövege. */
  brief?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  /**
   * Szerkesztői döntés: azok a napok (dátumok), ahol a 90 napon belül már
   * használt igehely tudatosan megmarad. A terven belüli ismétlést ez nem oldja fel.
   */
  repeatOverrides?: string[];
  /** Elküldött értesítések (fajta → időpont), hogy ugyanazt ne küldjük újra. */
  notifiedAt?: Record<string, string>;
}

/** Az igehelyek és témák 90 napos nyilvántartásának egy sora. */
export interface RegistryEntry {
  date: string;
  /** Igehely hivatkozása (normalizálatlan, megjelenítéshez). */
  reference: string;
  title: string;
  category?: string;
  /** A hét témája, ha heti sorozatból való. */
  theme?: string;
  weekId?: string;
}

export interface PlanRegistry {
  version: 1;
  entries: RegistryEntry[];
}

// ── hét-kezelés ─────────────────────────────────────────────────────────────

function weekdayIndexMonday0(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = vasárnap
  return (weekday + 6) % 7;
}

/** A dátum hétfőtől vasárnapig tartó hetének hétfője. */
export function getWeekStart(date: string): string {
  if (!isValidIsoDate(date)) throw new Error(`Érvénytelen dátum: ${date}`);
  return addDaysToIsoDate(date, -weekdayIndexMonday0(date));
}

export function isWeekStart(date: string): boolean {
  return isValidIsoDate(date) && weekdayIndexMonday0(date) === 0;
}

/** A hét 7 napja hétfőtől vasárnapig. */
export function getWeekDates(weekId: string): string[] {
  if (!isWeekStart(weekId)) throw new Error(`A hét azonosítója nem hétfő: ${weekId}`);
  return Array.from({ length: WEEK_LENGTH }, (_, i) => addDaysToIsoDate(weekId, i));
}

/** A mai napot követő hét hétfője (a következő hét előkészítéséhez). */
export function getNextWeekStart(today: string): string {
  return addDaysToIsoDate(getWeekStart(today), 7);
}

// ── létrehozás és ellenőrzés ────────────────────────────────────────────────

export function createEmptyWeeklyPlan(params: {
  weekId: string;
  source: WeeklyPlanSource;
  theme?: string;
  brief?: string;
  now?: Date;
}): WeeklyPlan {
  const stamp = (params.now ?? new Date()).toISOString();
  return {
    version: WEEKLY_PLAN_VERSION,
    weekId: params.weekId,
    theme: params.theme ?? "",
    arc: "",
    days: getWeekDates(params.weekId).map((date) => ({
      date,
      title: "",
      verse: "",
      role: "",
      category: "",
      excerpt: "",
      state: "planned" as const,
    })),
    status: "draft",
    source: params.source,
    brief: params.brief,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Az igehely összehasonlításra normalizált kulcsa. */
export function verseKey(verse: string): string {
  return normalizeReference(extractVerseReference(verse));
}

/**
 * Szerkezeti ellenőrzés — minden mentésnél. A tartalom (cím, ige) hiánya itt
 * még nem hiba: a vázlat félkész is lehet. A jóváhagyás szabályait lásd:
 * `planApprovalIssues`.
 */
export function validateWeeklyPlanStructure(plan: WeeklyPlan): string[] {
  const errors: string[] = [];

  if (plan.version !== WEEKLY_PLAN_VERSION) errors.push("Ismeretlen terv-verzió.");
  if (!isWeekStart(plan.weekId)) {
    errors.push(`A hét azonosítója nem érvényes hétfő: ${plan.weekId}.`);
    return errors;
  }
  if (!WEEKLY_PLAN_STATUSES.includes(plan.status)) errors.push("Érvénytelen terv-státusz.");
  if (!WEEKLY_PLAN_SOURCES.includes(plan.source)) errors.push("Érvénytelen terv-forrás.");
  if (typeof plan.theme !== "string" || typeof plan.arc !== "string") {
    errors.push("A téma és az ív szöveg kell legyen.");
  }

  if (
    plan.repeatOverrides !== undefined &&
    (!Array.isArray(plan.repeatOverrides) || plan.repeatOverrides.some((d) => typeof d !== "string"))
  ) {
    errors.push("A repeatOverrides dátumok listája kell legyen.");
  }

  const expected = getWeekDates(plan.weekId);
  if (!Array.isArray(plan.days) || plan.days.length !== WEEK_LENGTH) {
    errors.push(`A tervnek pontosan ${WEEK_LENGTH} napot kell tartalmaznia.`);
    return errors;
  }
  plan.days.forEach((day, i) => {
    if (day.date !== expected[i]) {
      errors.push(`A(z) ${i + 1}. nap dátuma ${expected[i]} kell legyen (most: ${day.date}).`);
    }
    if (!WEEKLY_PLAN_DAY_STATES.includes(day.state)) {
      errors.push(`${expected[i]}: érvénytelen napi állapot.`);
    }
    for (const field of ["title", "verse", "role", "category", "excerpt"] as const) {
      if (typeof day[field] !== "string") errors.push(`${expected[i]}: a(z) ${field} szöveg kell legyen.`);
    }
  });
  return errors;
}

export interface PlanIssues {
  errors: string[];
  warnings: string[];
}

export interface RegistryConflict {
  date: string;
  verse: string;
  /** A korábbi előfordulás a nyilvántartásban. */
  previous: RegistryEntry;
}

/**
 * Az igehely ismétlődései: a terven belül és a 90 napos nyilvántartással
 * szemben. A saját hét bejegyzései nem számítanak (újratervezésnél).
 */
export function findPlanConflicts(
  plan: WeeklyPlan,
  registry: PlanRegistry
): { internal: { date: string; verse: string; sameAs: string }[]; registry: RegistryConflict[] } {
  const internal: { date: string; verse: string; sameAs: string }[] = [];
  const seen = new Map<string, string>();
  const weekDates = new Set(plan.days.map((d) => d.date));

  const conflicts: RegistryConflict[] = [];
  for (const day of plan.days) {
    if (!day.verse.trim()) continue;
    const key = verseKey(day.verse);
    const first = seen.get(key);
    if (first) internal.push({ date: day.date, verse: day.verse, sameAs: first });
    else seen.set(key, day.date);

    const previous = registry.entries.find(
      (e) =>
        verseKey(e.reference) === key &&
        e.weekId !== plan.weekId &&
        !weekDates.has(e.date)
    );
    if (previous) conflicts.push({ date: day.date, verse: day.verse, previous });
  }
  return { internal, registry: conflicts };
}

/** A jóváhagyás feltételei: hibák (blokkolnak) és figyelmeztetések. */
export function planApprovalIssues(plan: WeeklyPlan, registry: PlanRegistry): PlanIssues {
  const errors = validateWeeklyPlanStructure(plan);
  const warnings: string[] = [];
  if (errors.length > 0) return { errors, warnings };

  if (!plan.theme.trim()) errors.push("A heti téma hiányzik.");
  for (const day of plan.days) {
    if (!day.title.trim()) errors.push(`${day.date}: hiányzik a cím.`);
    if (!day.verse.trim()) errors.push(`${day.date}: hiányzik az igehely.`);
    if (!day.category.trim()) warnings.push(`${day.date}: nincs kategória.`);
    if (!day.role.trim()) warnings.push(`${day.date}: nincs megadva a nap szerepe az ívben.`);
  }

  const conflicts = findPlanConflicts(plan, registry);
  for (const c of conflicts.internal) {
    errors.push(`${c.date}: az igehely (${c.verse}) ugyanaz, mint ${c.sameAs} napján.`);
  }
  const overrides = new Set(plan.repeatOverrides ?? []);
  for (const c of conflicts.registry) {
    const message = `${c.date}: az igehely (${c.verse}) már szerepelt ${c.previous.date} napján („${c.previous.title}”).`;
    if (overrides.has(c.date)) warnings.push(`${message} (Szerkesztői döntéssel megtartva.)`);
    else errors.push(message);
  }
  return { errors, warnings };
}
