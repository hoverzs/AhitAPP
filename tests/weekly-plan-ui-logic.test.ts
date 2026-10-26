import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATING_STALE_MS,
  describeDay,
  describeWeek,
  foreignDays,
  missingPublicDays,
  generationProgress,
  generationQueue,
  planStepState,
  shouldStopQueue,
  suggestedStep,
  weekApprovalState,
  type DaySummary,
  type WeekOverview,
} from "../src/lib/weekly-plan/ui-logic";
import {
  createEmptyWeeklyPlan,
  planApprovalIssues,
  type WeeklyPlan,
  type WeeklyPlanDay,
} from "../src/lib/weekly-plan/types";

const WEEK = "2026-10-26";
const NOW = new Date("2026-10-27T12:00:00.000Z");

function plan(states: Partial<WeeklyPlanDay>[] = [], overrides: Partial<WeeklyPlan> = {}): WeeklyPlan {
  const p = createEmptyWeeklyPlan({ weekId: WEEK, source: "gemini", theme: "Téma" });
  const verses = ["A 1:1", "B 2:2", "C 3:3", "D 4:4", "E 5:5", "F 6:6", "G 7:7"];
  p.days.forEach((d, i) => {
    d.title = `Cím ${i + 1}`;
    d.verse = verses[i];
    d.category = "Hit";
    d.role = "Szerep";
    Object.assign(d, states[i] ?? {});
  });
  return { ...p, status: "approved", ...overrides };
}

function summary(status: string, extra: Partial<NonNullable<DaySummary["devotional"]>> = {}) {
  return { status, title: "Cím", weekId: WEEK, ...extra };
}

function overview(p: WeeklyPlan, records: (DaySummary["devotional"])[]): WeekOverview {
  return {
    weekId: WEEK,
    today: "2026-10-27",
    editable: true,
    plan: p,
    issues: planApprovalIssues(p, { version: 1, entries: [] }),
    days: p.days.map((d, i) => ({ date: d.date, weekday: `Nap${i}`, devotional: records[i] ?? null })),
    briefFormat: "",
  };
}

test("nap állapota: nincs szöveg → generálandó, nem jóváhagyható", () => {
  const p = plan();
  const view = describeDay(WEEK, p.days[0], { weekday: "Hétfő", devotional: null }, NOW);
  assert.equal(view.label, "no-text");
  assert.equal(view.needsGeneration, true);
  assert.equal(view.canApprove, false);
});

test("kész, ellenőrzésre váró nap jóváhagyható és szerkeszthető", () => {
  const p = plan([{ state: "ready" }]);
  const view = describeDay(WEEK, p.days[0], { weekday: "Hétfő", devotional: summary("needs_review") }, NOW);
  assert.equal(view.label, "review");
  assert.equal(view.canApprove, true);
  assert.equal(view.editable, true);
  assert.equal(view.locked, false);
});

test("elavult nap nem hagyható jóvá, generálandó", () => {
  const p = plan([{ state: "stale" }]);
  const view = describeDay(WEEK, p.days[0], { weekday: "Hétfő", devotional: summary("needs_review") }, NOW);
  assert.equal(view.label, "stale");
  assert.equal(view.canApprove, false);
  assert.equal(view.needsGeneration, true);
  assert.match(view.blockedReason!, /megváltozott/);
});

test("hiányos (félbeszakadt) szöveg nem hagyható jóvá", () => {
  const p = plan([{ state: "ready" }]);
  const view = describeDay(
    WEEK,
    p.days[0],
    { weekday: "Hétfő", devotional: summary("needs_review", { lastApiError: "A generált szöveg félbeszakadt" }) },
    NOW
  );
  assert.equal(view.label, "incomplete");
  assert.equal(view.canApprove, false);
});

test("jóváhagyott és közzétett nap zárolt: szerkesztés előtt vissza kell vonni", () => {
  for (const status of ["approved", "published"]) {
    const p = plan([{ state: "ready" }]);
    const view = describeDay(WEEK, p.days[0], { weekday: "Hétfő", devotional: summary(status) }, NOW);
    assert.equal(view.locked, true, status);
    assert.equal(view.editable, false, status);
    assert.equal(view.canApprove, false, status);
  }
});

test("sikertelen, megszakadt és élő 'generating' nap megkülönböztetése", () => {
  const fresh = new Date(NOW.getTime() - 60_000).toISOString();
  const old = new Date(NOW.getTime() - GENERATING_STALE_MS - 1000).toISOString();
  const p = plan([
    { state: "failed", error: "Gemini hiba" },
    { state: "generating", lastAttemptAt: fresh },
    { state: "generating", lastAttemptAt: old },
  ]);
  const labels = [0, 1, 2].map(
    (i) => describeDay(WEEK, p.days[i], { weekday: "x", devotional: null }, NOW)
  );
  assert.equal(labels[0].label, "failed");
  assert.equal(labels[0].needsGeneration, true);
  assert.match(labels[0].blockedReason!, /Gemini hiba/);
  assert.equal(labels[1].label, "generating");
  assert.equal(labels[1].needsGeneration, false, "az élő generálást nem indítjuk újra");
  assert.equal(labels[2].label, "interrupted");
  assert.equal(labels[2].needsGeneration, true);
});

test("másik forrásból származó áhítatot nem generálunk és nem hagyunk jóvá", () => {
  const p = plan();
  const view = describeDay(
    WEEK,
    p.days[0],
    { weekday: "Hétfő", devotional: { status: "published", title: "Régi", weekId: undefined } },
    NOW
  );
  assert.equal(view.label, "foreign");
  assert.equal(view.needsGeneration, false);
  assert.equal(view.canApprove, false);
});

test("generálási sor: csak a hiányzó / sikertelen / elavult / megszakadt napok, sorrendben; a kész megmarad", () => {
  const p = plan([
    { state: "ready" },
    { state: "failed" },
    { state: "planned" },
    { state: "stale" },
    { state: "ready" },
    { state: "planned" },
    { state: "planned" },
  ]);
  const records = [summary("needs_review"), null, null, summary("needs_review"), summary("approved"), null, null];
  const views = describeWeek(overview(p, records), NOW);
  assert.deepEqual(
    generationQueue(views),
    [p.days[1].date, p.days[2].date, p.days[3].date, p.days[5].date, p.days[6].date]
  );
  const progress = generationProgress(views);
  assert.equal(progress.total, 7);
  assert.equal(progress.done, 2);
  assert.equal(progress.failed, 1);
  assert.equal(progress.remaining, 5);
});

test("a sor két egymás utáni hiba után megáll", () => {
  assert.equal(shouldStopQueue(0), false);
  assert.equal(shouldStopQueue(1), false);
  assert.equal(shouldStopQueue(2), true);
});

test("teljes heti jóváhagyás csak akkor engedett, ha minden nap jóváhagyható vagy már jóváhagyott", () => {
  const ready = plan(Array.from({ length: 7 }, () => ({ state: "ready" as const })));
  const allReview = describeWeek(overview(ready, Array(7).fill(summary("needs_review"))), NOW);
  assert.equal(weekApprovalState(allReview).canApproveAll, true);

  // Egy hiányos nap blokkolja az egészet.
  const records = Array(7).fill(summary("needs_review"));
  records[3] = summary("needs_review", { lastApiError: "csonka" });
  const oneBroken = weekApprovalState(describeWeek(overview(ready, records), NOW));
  assert.equal(oneBroken.canApproveAll, false);
  assert.equal(oneBroken.blocked.length, 1);
  assert.equal(oneBroken.approvable.length, 6);

  // Egy elavult nap is blokkol.
  const staleStates = ready.days.map((d, i) => ({ ...d, state: i === 0 ? ("stale" as const) : d.state }));
  const stalePlan = { ...ready, days: staleStates };
  assert.equal(
    weekApprovalState(describeWeek(overview(stalePlan, Array(7).fill(summary("needs_review"))), NOW)).canApproveAll,
    false
  );

  // Mind jóváhagyott.
  const done = weekApprovalState(describeWeek(overview(ready, Array(7).fill(summary("approved"))), NOW));
  assert.equal(done.allApproved, true);
  assert.equal(done.canApproveAll, false, "nincs mit jóváhagyni");
});

test("javasolt lépés: terv → generálás → ellenőrzés", () => {
  assert.equal(suggestedStep(null, []), "plan");
  const draft = plan([], { status: "draft" });
  assert.equal(suggestedStep(draft, describeWeek(overview(draft, []), NOW)), "plan");

  const approved = plan();
  assert.equal(suggestedStep(approved, describeWeek(overview(approved, []), NOW)), "generate");

  const allReady = plan(Array.from({ length: 7 }, () => ({ state: "ready" as const })));
  const views = describeWeek(overview(allReady, Array(7).fill(summary("needs_review"))), NOW);
  assert.equal(suggestedStep(allReady, views), "review");
});

test("terv-lépés: hibák blokkolnak; a nyilvántartási ismétlés felülbírálással feloldódik", () => {
  assert.equal(planStepState(null, null).hasPlan, false);

  const p = plan([], { status: "draft" });
  const ok = planStepState(p, { errors: [], warnings: [] });
  assert.equal(ok.canApprove, true);

  const repeat = `${p.days[4].date}: az igehely (E 5:5) már szerepelt 2026-09-01 napján („Régi”).`;
  const blocked = planStepState(p, { errors: [repeat], warnings: [] });
  assert.equal(blocked.canApprove, false);
  assert.deepEqual(blocked.repeatDates, [p.days[4].date]);
  assert.equal(blocked.blockers.length, 1);

  const overridden = planStepState({ ...p, repeatOverrides: [p.days[4].date] }, {
    errors: [repeat],
    warnings: [],
  });
  assert.equal(overridden.blockers.length, 0, "a felülbírált ismétlés már nem akadály a felületen");

  const internal = `${p.days[2].date}: az igehely (C 3:3) ugyanaz, mint ${p.days[0].date} napján.`;
  const stillBlocked = planStepState({ ...p, repeatOverrides: [p.days[2].date] }, {
    errors: [internal],
    warnings: [],
  });
  assert.equal(stillBlocked.blockers.length, 1, "a terven belüli ismétlést a felülbírálás nem oldja");
});

test("hiányzó nyilvános nap: az elérkezett, jóváhagyatlan napok jelzése; jövőbeli és idegen nap nem", () => {
  const p = plan(Array.from({ length: 7 }, () => ({ state: "ready" as const })));
  const records = [
    summary("approved"), // 10-26: jóváhagyott
    summary("needs_review"), // 10-27 (ma): még nincs jóváhagyva → hiány
    null, // 10-28: jövő → nem hiány
  ];
  const views = describeWeek(overview(p, records), NOW);
  const missing = missingPublicDays(p, views, "2026-10-27");
  assert.deepEqual(missing.map((v) => v.date), ["2026-10-27"]);

  const draft = { ...p, status: "draft" as const };
  assert.deepEqual(missingPublicDays(draft, views, "2026-10-27"), [], "vázlat terv nem kezeli a napot");
  assert.deepEqual(missingPublicDays(null, [], "2026-10-27"), []);
});

test("idegen forrású nap jelzése a héten", () => {
  const p = plan();
  const views = describeWeek(
    overview(p, [{ status: "published", title: "Régi", weekId: undefined }]),
    NOW
  );
  assert.deepEqual(foreignDays(views).map((v) => v.date), [p.days[0].date]);
});
