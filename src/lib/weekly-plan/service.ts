import { addDaysToIsoDate, getAppTodayIso } from "../app-date";
import { limitImageKeywords } from "../planned-day-mapper";
import { getDevotionalStorage } from "../storage";
import { extractVerseReference } from "../devotional-memory";
import { pruneRegistry } from "./registry";
import {
  WeeklyPlanConflictError,
  WeeklyPlanInputError,
  WeeklyPlanLockedError,
  WeeklyPlanNotApprovableError,
} from "./errors";
import type { PlanDayDraft, PlanDraft } from "./parse";
import { parseStructuredBrief } from "./parse";
import { draftProblems, repairDraftOnce, requestPlanDraft } from "./plan-model";
import { buildProposeUserPrompt, buildRevisePromptUser } from "./prompts";
import { getWeeklyPlanStore, type WeeklyPlanStore } from "./store";
import {
  createEmptyWeeklyPlan,
  getWeekStart,
  isWeekStart,
  planApprovalIssues,
  type PlanIssues,
  type PlanRegistry,
  type WeeklyPlan,
  type WeeklyPlanDay,
  type WeeklyPlanSource,
} from "./types";

/** Hány hétre előre lehet tervezni (a mai hét hétfőjétől számítva). */
export const MAX_PLANNING_WEEKS_AHEAD = 12;

export const LIMITS = {
  theme: 200,
  arc: 1500,
  title: 200,
  verse: 600,
  role: 400,
  category: 80,
  excerpt: 600,
  imageKeywords: 120,
  instruction: 2000,
  themeRequest: 500,
  brief: 20000,
} as const;

export interface PlanOperationResult {
  plan: WeeklyPlan;
  issues: PlanIssues;
  /** Olyan napok, amelyeknek az elkészült szövege a módosítás miatt elavult (újragenerálható). */
  staleDates: string[];
  /** A Gemini egy automatikus javító kört futtatott az ismétlődő igehelyek miatt. */
  repaired?: boolean;
}

// ── közös segédek ───────────────────────────────────────────────────────────

/**
 * A heti nyilvántartás + a napi folyamat korábbi előzménye (meta: az utolsó
 * napok igehelyei és a törölt napok használt igehelyei). Így a heti tervező
 * a napi folyamatban már használt igéket sem ismétli. A dátum nélküli
 * (régi) igehelyek a 90 napos ablak szélére kerülnek, hogy ne essenek egy
 * terv hetébe (és ne rejtsenek el ütközést).
 */
export async function readEffectiveRegistry(
  store: WeeklyPlanStore,
  today: string = getAppTodayIso()
): Promise<PlanRegistry> {
  const registry = await store.getRegistry();
  let meta: Awaited<ReturnType<NonNullable<ReturnType<typeof getDevotionalStorage>["getMeta"]>>> | null = null;
  try {
    meta = (await getDevotionalStorage().getMeta?.()) ?? null;
  } catch (error) {
    console.warn("[weekly-plan] a napi előzmény (meta) olvasása sikertelen:", error);
  }
  if (!meta) return registry;

  const entries = [...registry.entries];
  const seen = new Set(entries.map((e) => `${e.date}|${e.reference.toLowerCase()}`));
  const covered = new Set<string>();
  for (const d of meta.recentDays ?? []) {
    covered.add(d.verseReference.toLowerCase());
    const key = `${d.date}|${d.verseReference.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ date: d.date, reference: d.verseReference, title: d.title, category: d.category });
  }
  const edge = addDaysToIsoDate(today, -89);
  for (const ref of meta.usedVerseReferences ?? []) {
    if (covered.has(ref.toLowerCase())) continue;
    const key = `${edge}|${ref.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ date: edge, reference: extractVerseReference(ref), title: "(korábbi napi áhítat)" });
  }
  return pruneRegistry({ version: 1, entries }, today);
}

function storeOf(store?: WeeklyPlanStore): WeeklyPlanStore {
  return store ?? getWeeklyPlanStore();
}

/** Módosítás csak a mai hét és az előre tervezhető hetek számára engedett. */
export function assertWeekEditable(weekId: string, today: string = getAppTodayIso()): void {
  if (!isWeekStart(weekId)) {
    throw new WeeklyPlanInputError(`A hét azonosítója nem érvényes hétfő: ${weekId}.`);
  }
  const first = getWeekStart(today);
  const last = addDaysToIsoDate(first, MAX_PLANNING_WEEKS_AHEAD * 7);
  if (weekId < first) {
    throw new WeeklyPlanInputError("A már lezárult hét terve nem módosítható.");
  }
  if (weekId > last) {
    throw new WeeklyPlanInputError(
      `Legfeljebb ${MAX_PLANNING_WEEKS_AHEAD} hétre előre lehet tervezni.`
    );
  }
}

export function cleanText(value: unknown, max: number, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new WeeklyPlanInputError(`A(z) ${field} mező szöveg kell legyen.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new WeeklyPlanInputError(`A(z) ${field} mező legfeljebb ${max} karakter lehet.`);
  }
  return text;
}

/** A terv egy napja megváltozott: a meglévő szöveg elavul, különben újra tervezett. */
function changedState(previous: WeeklyPlanDay["state"]): WeeklyPlanDay["state"] {
  if (previous === "generating") return previous;
  return previous === "ready" || previous === "stale" ? "stale" : "planned";
}

function sameContent(a: WeeklyPlanDay, b: { title: string; verse: string; role: string }): boolean {
  return a.title === b.title && a.verse === b.verse && a.role === b.role;
}

function assertDraftPlan(plan: WeeklyPlan, action: string): void {
  if (plan.status !== "draft") {
    throw new WeeklyPlanLockedError(
      `A jóváhagyott terv nem ${action}. Előbb nyisd újra szerkesztésre.`
    );
  }
}

function assertFresh(plan: WeeklyPlan, expectedUpdatedAt: string | undefined): void {
  if (!expectedUpdatedAt) {
    throw new WeeklyPlanInputError("Hiányzik az expectedUpdatedAt (a betöltött terv időbélyege).");
  }
  if (plan.updatedAt !== expectedUpdatedAt) throw new WeeklyPlanConflictError(plan);
}

function hasGeneratedDays(plan: WeeklyPlan): boolean {
  return plan.days.some(
    (d) => d.state === "ready" || d.state === "generating" || d.state === "stale"
  );
}

/**
 * Vázlat ráírása egy meglévő (vagy üres) tervre. Az érintetlen nap megtartja az
 * állapotát; a megváltozott nap újra „planned” lesz, és ha elkészült szövege
 * volt, az `staleDates`-be kerül.
 */
export function applyDraft(
  base: WeeklyPlan,
  draft: PlanDraft,
  options: { source?: WeeklyPlanSource; brief?: string } = {}
): { plan: WeeklyPlan; staleDates: string[] } {
  const staleDates: string[] = [];
  const keepOverrides = new Set(base.repeatOverrides ?? []);

  const days: WeeklyPlanDay[] = base.days.map((previous, i) => {
    const next: PlanDayDraft = draft.days[i];
    const unchanged = sameContent(previous, next);
    if (!unchanged) {
      keepOverrides.delete(previous.date);
      if (previous.state === "ready") staleDates.push(previous.date);
    }
    return {
      date: previous.date,
      title: next.title,
      verse: next.verse,
      role: next.role,
      category: next.category,
      excerpt: next.excerpt,
      imageKeywords: next.imageKeywords,
      state: unchanged ? previous.state : changedState(previous.state),
      error: unchanged ? previous.error : undefined,
      lastAttemptAt: unchanged ? previous.lastAttemptAt : undefined,
    };
  });

  return {
    plan: {
      ...base,
      theme: draft.theme,
      arc: draft.arc,
      days,
      source: options.source ?? base.source,
      brief: options.brief ?? base.brief,
      repeatOverrides: [...keepOverrides],
    },
    staleDates,
  };
}

async function describe(
  store: WeeklyPlanStore,
  plan: WeeklyPlan,
  extra: Partial<PlanOperationResult> = {}
): Promise<PlanOperationResult> {
  const registry = await readEffectiveRegistry(store);
  return { plan, issues: planApprovalIssues(plan, registry), staleDates: [], ...extra };
}

/** Új terv létrehozása vagy a meglévő vázlat cseréje (ütközésbiztosan). */
async function persistDraft(
  store: WeeklyPlanStore,
  weekId: string,
  existing: WeeklyPlan | null,
  build: (base: WeeklyPlan) => { plan: WeeklyPlan; staleDates: string[] },
  source: WeeklyPlanSource,
  brief?: string
): Promise<{ plan: WeeklyPlan; staleDates: string[] }> {
  if (!existing) {
    const built = build(createEmptyWeeklyPlan({ weekId, source, brief }));
    return { plan: await store.createPlan(built.plan), staleDates: built.staleDates };
  }
  let staleDates: string[] = [];
  const plan = await store.updatePlan(weekId, (current) => {
    if (current.updatedAt !== existing.updatedAt) throw new WeeklyPlanConflictError(current);
    const built = build(current);
    staleDates = built.staleDates;
    return built.plan;
  });
  return { plan, staleDates };
}

function assertReplaceable(existing: WeeklyPlan | null): void {
  if (!existing) return;
  if (existing.status === "approved") {
    throw new WeeklyPlanLockedError(
      "Erre a hétre már van jóváhagyott terv. Nyisd újra szerkesztésre, vagy finomítsd."
    );
  }
  if (hasGeneratedDays(existing)) {
    throw new WeeklyPlanLockedError(
      "Ennek a tervnek már vannak elkészült napjai — az újratervezés elvenné őket. Használd a finomítást (utasítással) vagy a kézi szerkesztést."
    );
  }
}

// ── műveletek ───────────────────────────────────────────────────────────────

/**
 * Terv készítése rövid témából és/vagy szerkesztői briefből Geminivel. Az
 * ismétlődő igehelyeket egy automatikus javító kör próbálja kiszűrni.
 */
export async function proposePlan(
  params: {
    weekId: string;
    theme?: string;
    brief?: string;
    today?: string;
    /** Autopilot: téma és brief nélkül, a terv forrása „auto”. */
    auto?: boolean;
  },
  store?: WeeklyPlanStore
): Promise<PlanOperationResult> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const theme = cleanText(params.theme, LIMITS.themeRequest, "téma");
  const brief = cleanText(params.brief, LIMITS.brief, "brief");
  if (!theme && !brief && !params.auto) {
    throw new WeeklyPlanInputError("Adj meg rövid témát vagy szerkesztői briefet.");
  }

  const existing = await s.getPlan(params.weekId);
  assertReplaceable(existing);
  const registry = await readEffectiveRegistry(s);

  let draft = await requestPlanDraft(
    buildProposeUserPrompt({ weekId: params.weekId, theme, brief, registry, auto: params.auto }),
    "propose"
  );
  const repaired = await maybeRepair(params.weekId, draft, registry);
  draft = repaired.draft;

  const source: WeeklyPlanSource = params.auto ? "auto" : brief ? "brief" : "gemini";
  const { plan, staleDates } = await persistDraft(
    s,
    params.weekId,
    existing,
    (base) => applyDraft({ ...base, repeatOverrides: [] }, draft, { source, brief: brief || theme }),
    source,
    brief || theme
  );
  return describe(s, plan, { staleDates, repaired: repaired.repaired });
}

async function maybeRepair(
  weekId: string,
  draft: PlanDraft,
  registry: PlanRegistry,
  overrides: string[] = []
): Promise<{ draft: PlanDraft; repaired: boolean }> {
  const probe = applyDraft(
    { ...createEmptyWeeklyPlan({ weekId, source: "gemini" }), repeatOverrides: overrides },
    draft
  ).plan;
  const problems = draftProblems(probe, registry);
  if (problems.length === 0) return { draft, repaired: false };
  return repairDraftOnce({ weekId, draft, problems, registry });
}

/**
 * Természetes nyelvű módosítás a meglévő tervből kiindulva. A Gemini a teljes
 * jelenlegi tervet kapja, és csak az utasítás által érintett részeket írja át.
 */
export async function revisePlan(
  params: { weekId: string; instruction: string; expectedUpdatedAt?: string; today?: string },
  store?: WeeklyPlanStore
): Promise<PlanOperationResult> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const instruction = cleanText(params.instruction, LIMITS.instruction, "utasítás");
  if (!instruction) throw new WeeklyPlanInputError("Írd le, mit módosítsunk a terven.");

  const current = await s.getPlan(params.weekId);
  if (!current) throw new WeeklyPlanInputError("Erre a hétre még nincs terv — előbb készíts egyet.");
  assertDraftPlan(current, "finomítható");
  assertFresh(current, params.expectedUpdatedAt);

  const registry = await readEffectiveRegistry(s);
  let draft = await requestPlanDraft(
    buildRevisePromptUser({ plan: current, instruction, registry }),
    "revise"
  );
  const repaired = await maybeRepair(
    params.weekId,
    draft,
    registry,
    current.repeatOverrides
  );
  draft = repaired.draft;

  const { plan, staleDates } = await persistDraft(
    s,
    params.weekId,
    current,
    (base) => applyDraft(base, draft),
    current.source
  );
  return describe(s, plan, { staleDates, repaired: repaired.repaired });
}

/**
 * ChatGPT-ben (vagy máshol) kidolgozott, strukturált terv közvetlen betöltése
 * — Gemini-hívás nélkül. Ha a szöveg nem strukturált, PlanParseError a hiányokkal
 * (a hívó ilyenkor javasolhatja a briefként való feldolgozást).
 */
export async function importPlan(
  params: { weekId: string; text: string; today?: string },
  store?: WeeklyPlanStore
): Promise<PlanOperationResult> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const text = cleanText(params.text, LIMITS.brief, "terv");
  const draft = parseStructuredBrief(text); // PlanParseError, ha nem strukturált
  validateDraftLengths(draft);

  const existing = await s.getPlan(params.weekId);
  assertReplaceable(existing);

  const { plan, staleDates } = await persistDraft(
    s,
    params.weekId,
    existing,
    (base) => applyDraft({ ...base, repeatOverrides: [] }, draft, { source: "brief", brief: text }),
    "brief",
    text
  );
  return describe(s, plan, { staleDates });
}

function validateDraftLengths(draft: PlanDraft): void {
  cleanText(draft.theme, LIMITS.theme, "téma");
  cleanText(draft.arc, LIMITS.arc, "ív");
  draft.days.forEach((d, i) => {
    const label = `${i + 1}. nap`;
    cleanText(d.title, LIMITS.title, `${label} címe`);
    cleanText(d.verse, LIMITS.verse, `${label} igehelye`);
    cleanText(d.role, LIMITS.role, `${label} szerepe`);
    cleanText(d.category, LIMITS.category, `${label} kategóriája`);
    cleanText(d.excerpt, LIMITS.excerpt, `${label} kivonata`);
  });
}

export interface DayPatch {
  date: string;
  title?: string;
  verse?: string;
  role?: string;
  category?: string;
  excerpt?: string;
  imageKeywords?: string;
}

export interface PlanPatch {
  theme?: string;
  arc?: string;
  days?: DayPatch[];
}

/** Kézi szerkesztés: téma, ív és napi mezők módosítása (ütközésbiztosan). */
export async function patchPlan(
  params: { weekId: string; patch: PlanPatch; expectedUpdatedAt?: string; today?: string },
  store?: WeeklyPlanStore
): Promise<PlanOperationResult> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const { patch } = params;

  const theme = patch.theme !== undefined ? cleanText(patch.theme, LIMITS.theme, "téma") : undefined;
  const arc = patch.arc !== undefined ? cleanText(patch.arc, LIMITS.arc, "ív") : undefined;
  const dayPatches = (patch.days ?? []).map((d) => ({
    date: d.date,
    title: d.title !== undefined ? cleanText(d.title, LIMITS.title, "cím") : undefined,
    verse: d.verse !== undefined ? cleanText(d.verse, LIMITS.verse, "igehely") : undefined,
    role: d.role !== undefined ? cleanText(d.role, LIMITS.role, "szerep") : undefined,
    category:
      d.category !== undefined ? cleanText(d.category, LIMITS.category, "kategória") : undefined,
    excerpt: d.excerpt !== undefined ? cleanText(d.excerpt, LIMITS.excerpt, "kivonat") : undefined,
    imageKeywords:
      d.imageKeywords !== undefined
        ? limitImageKeywords(cleanText(d.imageKeywords, LIMITS.imageKeywords, "kulcsszavak")) ?? ""
        : undefined,
  }));
  if (theme === undefined && arc === undefined && dayPatches.length === 0) {
    throw new WeeklyPlanInputError("Nincs módosítandó mező.");
  }

  const current = await s.getPlan(params.weekId);
  if (!current) throw new WeeklyPlanInputError("Erre a hétre még nincs terv.");
  assertDraftPlan(current, "szerkeszthető");
  assertFresh(current, params.expectedUpdatedAt);
  for (const d of dayPatches) {
    if (!current.days.some((day) => day.date === d.date)) {
      throw new WeeklyPlanInputError(`A(z) ${d.date} nap nem tartozik ehhez a héthez.`);
    }
  }

  const staleDates: string[] = [];
  const plan = await s.updatePlan(params.weekId, (live) => {
    if (live.updatedAt !== current.updatedAt) throw new WeeklyPlanConflictError(live);
    const overrides = new Set(live.repeatOverrides ?? []);
    const days = live.days.map((day) => {
      const p = dayPatches.find((x) => x.date === day.date);
      if (!p) return day;
      const next: WeeklyPlanDay = {
        ...day,
        title: p.title ?? day.title,
        verse: p.verse ?? day.verse,
        role: p.role ?? day.role,
        category: p.category ?? day.category,
        excerpt: p.excerpt ?? day.excerpt,
        imageKeywords:
          p.imageKeywords !== undefined ? p.imageKeywords || undefined : day.imageKeywords,
      };
      if (!sameContent(day, next)) {
        overrides.delete(day.date);
        if (day.state === "ready") staleDates.push(day.date);
        next.state = changedState(day.state);
        next.error = undefined;
      }
      return next;
    });
    return {
      ...live,
      theme: theme ?? live.theme,
      arc: arc ?? live.arc,
      days,
      repeatOverrides: [...overrides],
    };
  });
  return describe(s, plan, { staleDates });
}

/**
 * Jóváhagyás: a terv rögzül, az igehelyek bekerülnek a 90 napos nyilvántartásba.
 * A terven belüli ismétlés mindig blokkol; a nyilvántartással szembeni ismétlést
 * szerkesztői döntéssel (`overrideRepeats`: dátumok) fel lehet oldani.
 */
export async function approvePlan(
  params: {
    weekId: string;
    expectedUpdatedAt?: string;
    overrideRepeats?: string[];
    today?: string;
  },
  store?: WeeklyPlanStore
): Promise<PlanOperationResult> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);

  const current = await s.getPlan(params.weekId);
  if (!current) throw new WeeklyPlanInputError("Erre a hétre még nincs terv.");
  assertFresh(current, params.expectedUpdatedAt);

  const weekDates = new Set(current.days.map((d) => d.date));
  const overrides = [...new Set(params.overrideRepeats ?? current.repeatOverrides ?? [])];
  for (const date of overrides) {
    if (!weekDates.has(date)) {
      throw new WeeklyPlanInputError(`A(z) ${date} nap nem tartozik ehhez a héthez.`);
    }
  }

  const registry = await readEffectiveRegistry(s);
  const candidate: WeeklyPlan = { ...current, repeatOverrides: overrides };
  const issues = planApprovalIssues(candidate, registry);
  if (issues.errors.length > 0) throw new WeeklyPlanNotApprovableError(issues);

  const plan = await s.updatePlan(params.weekId, (live) => {
    if (live.updatedAt !== current.updatedAt) throw new WeeklyPlanConflictError(live);
    return {
      ...live,
      status: "approved",
      approvedAt: live.approvedAt ?? new Date().toISOString(),
      repeatOverrides: overrides,
    };
  });
  await s.recordPlanInRegistry(plan);
  return describe(s, plan);
}

/** Jóváhagyott terv visszanyitása szerkesztésre (az elkészült napok megmaradnak). */
export async function reopenPlan(
  params: { weekId: string; expectedUpdatedAt?: string; today?: string },
  store?: WeeklyPlanStore
): Promise<PlanOperationResult> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const current = await s.getPlan(params.weekId);
  if (!current) throw new WeeklyPlanInputError("Erre a hétre még nincs terv.");
  assertFresh(current, params.expectedUpdatedAt);
  if (current.status === "draft") return describe(s, current);
  if (current.days.some((d) => d.state === "generating")) {
    throw new WeeklyPlanLockedError("Egy nap generálása folyamatban van — várd meg a végét.");
  }
  const plan = await s.updatePlan(params.weekId, (live) => {
    if (live.updatedAt !== current.updatedAt) throw new WeeklyPlanConflictError(live);
    // A szerkesztő átvette a tervet: az autopilot innentől nem nyúl hozzá (és nem hagyja jóvá a vázlatot).
    return {
      ...live,
      status: "draft",
      approvedAt: undefined,
      source: live.source === "auto" ? "manual" : live.source,
    };
  });
  return describe(s, plan);
}

/**
 * A jóváhagyott kézi terv visszaadása az autopilotnak: a hiányzó napok szövegét
 * ő pótolja és hagyja jóvá. A kézbentartási jelzések törlődnek.
 */
export async function handToAutopilot(
  params: { weekId: string; expectedUpdatedAt?: string; today?: string },
  store?: WeeklyPlanStore
): Promise<PlanOperationResult> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const current = await s.getPlan(params.weekId);
  if (!current) throw new WeeklyPlanInputError("Erre a hétre még nincs terv.");
  assertFresh(current, params.expectedUpdatedAt);
  if (current.status !== "approved") {
    throw new WeeklyPlanLockedError("Az autopilotnak csak jóváhagyott terv adható át.");
  }
  const plan = await s.updatePlan(params.weekId, (live) => {
    if (live.updatedAt !== current.updatedAt) throw new WeeklyPlanConflictError(live);
    return {
      ...live,
      source: "auto",
      days: live.days.map((d) => ({ ...d, manualHold: undefined, autoAttempts: 0 })),
    };
  });
  return describe(s, plan);
}

/** Vázlat törlése — csak akkor, ha még nincs elkészült nap (a szövegeket nem veszíthetjük el). */
export async function deletePlanDraft(
  params: { weekId: string; expectedUpdatedAt?: string; today?: string },
  store?: WeeklyPlanStore
): Promise<void> {
  const s = storeOf(store);
  assertWeekEditable(params.weekId, params.today);
  const current = await s.getPlan(params.weekId);
  if (!current) return;
  assertFresh(current, params.expectedUpdatedAt);
  assertDraftPlan(current, "törölhető");
  if (hasGeneratedDays(current)) {
    throw new WeeklyPlanLockedError("A tervnek vannak elkészült napjai — nem törölhető.");
  }
  await s.deletePlan(params.weekId);
}
