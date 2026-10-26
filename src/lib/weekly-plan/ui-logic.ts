import type { PlanIssues, WeeklyPlan, WeeklyPlanDay } from "./types";

/**
 * A heti áhítatműhely kliens-oldali döntési logikája: tiszta függvények, hogy
 * a szabályok (mit lehet jóváhagyni, mit kell generálni, mikor áll le a sor)
 * tesztelhetők legyenek. Nem importál szerver-oldali modult.
 */

/** Egy „generating” állapot ennyi ideig számít élőnek; utána elakadtnak vesszük (a szerverrel közös). */
export const GENERATING_STALE_MS = 10 * 60 * 1000;

/** Ennyi egymás utáni sikertelen nap után a sor megáll (valószínűleg rendszerszintű hiba). */
export const MAX_CONSECUTIVE_FAILURES = 2;

export interface DaySummary {
  date: string;
  weekday: string;
  devotional: null | {
    status: string;
    title: string;
    weekId?: string;
    lastApiError?: string;
    updatedAt?: string;
    imageUrl?: string;
  };
}

export interface WeekOverview {
  weekId: string;
  today: string;
  editable: boolean;
  plan: WeeklyPlan | null;
  issues: PlanIssues | null;
  days: DaySummary[];
  briefFormat: string;
}

export type StepId = "plan" | "generate" | "review";

export type DayLabel =
  | "no-text"
  | "generating"
  | "interrupted"
  | "failed"
  | "stale"
  | "incomplete"
  | "foreign"
  | "review"
  | "approved"
  | "published";

export const DAY_LABEL_HU: Record<DayLabel, string> = {
  "no-text": "Még nincs szöveg",
  generating: "Készül…",
  interrupted: "Megszakadt",
  failed: "Sikertelen",
  stale: "Elavult",
  incomplete: "Hiányos",
  foreign: "Másik forrásból",
  review: "Ellenőrzésre vár",
  approved: "Jóváhagyva",
  published: "Közzétéve",
};

export interface DayView {
  date: string;
  weekday: string;
  planDay: WeeklyPlanDay;
  summary: DaySummary["devotional"];
  label: DayLabel;
  /** A szöveg generálható / újragenerálható a sorból. */
  needsGeneration: boolean;
  canApprove: boolean;
  /** Ha nem hagyható jóvá, ennek az oka (felhasználónak). */
  blockedReason?: string;
  /** Jóváhagyott / közzétett: a szerkesztés előtt vissza kell vonni. */
  locked: boolean;
  /** A kész szöveg szerkeszthető (nem zárolt, van rekord, nem idegen forrás). */
  editable: boolean;
}

function isLiveGenerating(day: WeeklyPlanDay, now: Date): boolean {
  if (day.state !== "generating") return false;
  const started = day.lastAttemptAt ? Date.parse(day.lastAttemptAt) : 0;
  return now.getTime() - started < GENERATING_STALE_MS;
}

/** Egy nap összevont nézete: állapotcímke és mit szabad vele tenni. */
export function describeDay(
  weekId: string,
  planDay: WeeklyPlanDay,
  overview: Pick<DaySummary, "weekday" | "devotional">,
  now: Date = new Date()
): DayView {
  const summary = overview.devotional;
  const base = { date: planDay.date, weekday: overview.weekday, planDay, summary };
  const view = (
    label: DayLabel,
    extra: Partial<Omit<DayView, keyof typeof base | "label">> = {}
  ): DayView => ({
    ...base,
    label,
    needsGeneration: false,
    canApprove: false,
    locked: false,
    editable: false,
    ...extra,
  });

  if (summary && summary.weekId !== weekId) {
    return view("foreign", {
      blockedReason: "Ezen a napon már van egy másik forrásból (napi folyamat) származó áhítat.",
    });
  }
  if (isLiveGenerating(planDay, now)) {
    return view("generating", { blockedReason: "A szöveg még készül." });
  }
  if (planDay.state === "generating") {
    return view("interrupted", {
      needsGeneration: true,
      blockedReason: "A generálás megszakadt — folytasd.",
    });
  }
  if (planDay.state === "failed") {
    return view("failed", {
      needsGeneration: true,
      blockedReason: planDay.error ?? "A generálás sikertelen volt.",
    });
  }
  if (planDay.state === "stale") {
    return view("stale", {
      needsGeneration: true,
      editable: Boolean(summary),
      blockedReason: "A terv ezen napja a szöveg óta megváltozott — generáld újra.",
    });
  }
  if (!summary || planDay.state === "planned") {
    return view("no-text", { needsGeneration: !summary, blockedReason: "Még nincs szöveg." });
  }

  const locked = summary.status === "approved" || summary.status === "published";
  if (summary.lastApiError) {
    return view("incomplete", {
      editable: !locked,
      blockedReason: "A szöveg hiányos — javítsd vagy generáld újra.",
    });
  }
  if (summary.status === "published") return view("published", { locked: true });
  if (summary.status === "approved") return view("approved", { locked: true });
  return view("review", { canApprove: true, editable: true });
}

export function describeWeek(overview: WeekOverview, now: Date = new Date()): DayView[] {
  if (!overview.plan) return [];
  const plan = overview.plan;
  return plan.days.map((planDay) => {
    const summary = overview.days.find((d) => d.date === planDay.date) ?? {
      date: planDay.date,
      weekday: "",
      devotional: null,
    };
    return describeDay(plan.weekId, planDay, summary, now);
  });
}

/** A generálandó napok sorrendben: amelyiknek még nincs (vagy elavult / megszakadt) szövege. */
export function generationQueue(views: DayView[]): string[] {
  return views.filter((v) => v.needsGeneration).map((v) => v.date);
}

export interface GenerationProgress {
  total: number;
  done: number;
  failed: number;
  generating: number;
  remaining: number;
}

export function generationProgress(views: DayView[]): GenerationProgress {
  const done = views.filter((v) =>
    ["review", "approved", "published", "incomplete"].includes(v.label)
  ).length;
  return {
    total: views.length,
    done,
    failed: views.filter((v) => v.label === "failed" || v.label === "interrupted").length,
    generating: views.filter((v) => v.label === "generating").length,
    remaining: views.filter((v) => v.needsGeneration).length,
  };
}

/** Megálljon-e a sor: egymás utáni hibák után ne égessük a kvótát. */
export function shouldStopQueue(consecutiveFailures: number): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

export interface WeekApprovalState {
  approvable: string[];
  approved: string[];
  blocked: { date: string; reason: string }[];
  /** Mind a 7 nap jóváhagyott / közzétett. */
  allApproved: boolean;
  /** A „teljes hét jóváhagyása” gomb engedélyezett: van jóváhagyható nap, és nincs blokkolt. */
  canApproveAll: boolean;
}

export function weekApprovalState(views: DayView[]): WeekApprovalState {
  const approvable = views.filter((v) => v.canApprove).map((v) => v.date);
  const approved = views.filter((v) => v.locked).map((v) => v.date);
  const blocked = views
    .filter((v) => !v.canApprove && !v.locked)
    .map((v) => ({ date: v.date, reason: v.blockedReason ?? "Nem jóváhagyható." }));
  return {
    approvable,
    approved,
    blocked,
    allApproved: approved.length === views.length && views.length > 0,
    canApproveAll: approvable.length > 0 && blocked.length === 0,
  };
}

export interface PlanStepState {
  hasPlan: boolean;
  isDraft: boolean;
  canApprove: boolean;
  blockers: string[];
  /** A 90 napos nyilvántartással ütköző napok (felülbírálható figyelmeztetés). */
  repeatDates: string[];
}

/** A tervezési lépés állapota: jóváhagyható-e, és mi akadályozza. */
export function planStepState(plan: WeeklyPlan | null, issues: PlanIssues | null): PlanStepState {
  if (!plan) return { hasPlan: false, isDraft: false, canApprove: false, blockers: [], repeatDates: [] };
  const errors = issues?.errors ?? [];
  const overrides = new Set(plan.repeatOverrides ?? []);
  const repeatDates = errors
    .filter((e) => e.includes("már szerepelt"))
    .map((e) => e.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const unresolved = errors.filter((e) => {
    const date = e.slice(0, 10);
    return !(e.includes("már szerepelt") && overrides.has(date));
  });
  return {
    hasPlan: true,
    isDraft: plan.status === "draft",
    canApprove: plan.status === "draft" && errors.length === 0,
    blockers: unresolved,
    repeatDates,
  };
}

/** Melyik lépést érdemes megnyitni a hét állapota alapján. */
export function suggestedStep(plan: WeeklyPlan | null, views: DayView[]): StepId {
  if (!plan || plan.status !== "approved") return "plan";
  const stillToGenerate = views.some(
    (v) => v.needsGeneration || v.label === "generating"
  );
  return stillToGenerate ? "generate" : "review";
}

/**
 * Jóváhagyott terv napjai, amelyek már elérkeztek (dátum ≤ ma), de még nincs
 * jóváhagyott áhítatuk. A napi automatikus generálás ezeket kihagyja, ezért
 * tartalmi hiányt jelentenek — a műhely hangosan jelzi.
 */
export function missingPublicDays(plan: WeeklyPlan | null, views: DayView[], today: string): DayView[] {
  if (!plan || plan.status !== "approved") return [];
  return views.filter(
    (v) => v.date <= today && v.label !== "approved" && v.label !== "published" && v.label !== "foreign"
  );
}

/** Napok, ahol már van másik (napi folyamatból származó) áhítat — a heti műhely nem írja felül. */
export function foreignDays(views: DayView[]): DayView[] {
  return views.filter((v) => v.label === "foreign");
}

export type ReadinessStage =
  | "no-plan"
  | "plan-draft"
  | "plan-approved"
  | "texts-ready"
  | "ready-to-publish";

export interface WeekReadiness {
  stage: ReadinessStage;
  /** Rövid állapotcím — a terv jóváhagyása és a hét publikálásra készsége külön szerepel. */
  label: string;
  detail: string;
  planApproved: boolean;
  /** Elkészült (nem hiányos, nem elavult) szövegű napok. */
  textsReady: number;
  approvedDays: number;
  total: number;
  /** Mind a 7 nap szövege jóváhagyott: a hét publikálásra kész (a napok a saját napjukon jelennek meg). */
  publishReady: boolean;
  /** A publikálásra kész hét napjai közül ma már nyilvános / a saját napján megjelenő napok. */
  publicNow: number;
  scheduled: number;
}

/**
 * A heti TERV jóváhagyása és a hét PUBLIKÁLÁSRA KÉSZ állapota külön fogalom:
 * a terv jóváhagyása csak a generálás előfeltétele, nem jelenti, hogy a hét
 * áhítatai elkészültek vagy jóváhagyottak.
 */
export function weekReadiness(plan: WeeklyPlan | null, views: DayView[], today: string): WeekReadiness {
  const total = views.length || 7;
  const base = {
    planApproved: plan?.status === "approved",
    textsReady: views.filter((v) => ["review", "approved", "published"].includes(v.label)).length,
    approvedDays: views.filter((v) => v.locked).length,
    total,
    publishReady: false,
    publicNow: 0,
    scheduled: 0,
  };

  if (!plan) {
    return { ...base, stage: "no-plan", label: "Nincs heti terv", detail: "Készíts vagy importálj tervet a hétre." };
  }
  if (plan.status !== "approved") {
    return {
      ...base,
      stage: "plan-draft",
      label: "A terv még vázlat",
      detail: "Hagyd jóvá a tervet — ez a napi szövegek generálásának előfeltétele.",
    };
  }

  const allApproved = views.length > 0 && base.approvedDays === views.length;
  if (allApproved) {
    const publicNow = views.filter((v) => v.date <= today).length;
    return {
      ...base,
      stage: "ready-to-publish",
      label: "A hét publikálásra kész",
      detail:
        publicNow === views.length
          ? "Mind a 7 áhítat jóváhagyott és nyilvános."
          : `Mind a 7 áhítat jóváhagyott: ${publicNow} már nyilvános, ${views.length - publicNow} a saját napján jelenik meg automatikusan.`,
      publishReady: true,
      publicNow,
      scheduled: views.length - publicNow,
    };
  }

  const broken = views.filter((v) => v.needsGeneration || v.label === "incomplete" || v.label === "generating" || v.label === "foreign").length;
  if (broken === 0 && base.textsReady === views.length) {
    return {
      ...base,
      stage: "texts-ready",
      label: "A szövegek kész — jóváhagyásra várnak",
      detail: `${base.approvedDays}/${views.length} áhítat jóváhagyva; a hét még nem publikálásra kész.`,
    };
  }
  return {
    ...base,
    stage: "plan-approved",
    label: "A terv jóváhagyva — a hét még nem publikálásra kész",
    detail: `${base.textsReady}/${views.length} szöveg kész, ${base.approvedDays}/${views.length} áhítat jóváhagyva. A terv jóváhagyása csak a generálás előfeltétele.`,
  };
}
