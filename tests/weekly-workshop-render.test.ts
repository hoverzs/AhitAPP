import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyWeeklyPlan, type WeeklyPlan } from "../src/lib/weekly-plan/types";
import { describeWeek, type DaySummary, type WeekOverview } from "../src/lib/weekly-plan/ui-logic";

// A tsx teszt-futtató klasszikus JSX-et használ: a React globálisan kell.
(globalThis as { React?: unknown }).React = React;

const WEEK = "2026-10-26";

function plan(states: string[]): WeeklyPlan {
  const p = createEmptyWeeklyPlan({ weekId: WEEK, source: "gemini", theme: "Bizalom" });
  p.days.forEach((d, i) => {
    d.title = `Cím ${i + 1}`;
    d.verse = `Ige ${i + 1}:1 — szöveg`;
    d.category = "Hit";
    d.state = (states[i] ?? "planned") as WeeklyPlan["days"][number]["state"];
  });
  return { ...p, status: "approved" };
}

function overview(p: WeeklyPlan, records: (DaySummary["devotional"])[]): WeekOverview {
  return {
    weekId: WEEK,
    today: "2026-10-27",
    editable: true,
    plan: p,
    issues: { errors: [], warnings: [] },
    days: p.days.map((d, i) => ({ date: d.date, weekday: `Nap${i + 1}`, devotional: records[i] ?? null })),
    briefFormat: "{}",
  };
}

const noop = async () => {};

async function renderCards(ov: WeekOverview) {
  const { DayReviewCard } = await import("../src/components/admin/workshop/DayReviewCard");
  const views = describeWeek(ov, new Date("2026-10-27T12:00:00Z"));
  return views.map((view) =>
    renderToStaticMarkup(
      React.createElement(DayReviewCard, {
        view,
        week: WEEK,
        today: ov.today,
        busy: false,
        onChanged: noop,
        onToast: () => undefined,
      })
    )
  );
}

test("napi kártya: ellenőrzésre váró nap jóváhagyható; jóváhagyott nap zárolt, jövőbeli napnál ütemezést jelez", async () => {
  const records = [
    { status: "needs_review", title: "A", weekId: WEEK },
    { status: "approved", title: "B", weekId: WEEK },
    { status: "approved", title: "C", weekId: WEEK },
  ];
  const cards = await renderCards(overview(plan(["ready", "ready", "ready"]), records));

  assert.match(cards[0], /Jóváhagyás</);
  assert.equal(/Visszavonás/.test(cards[0]), false);
  assert.match(cards[0], /Ellenőrzésre vár/);

  // 10-27 (mai nap): nyilvános; 10-28: ütemezett
  assert.match(cards[1], /Visszavonás/);
  assert.match(cards[1], /Nyilvános az oldalon/);
  assert.equal(/>Jóváhagyás</.test(cards[1]), false);
  assert.match(cards[2], /Megjelenik 2026-10-28-án automatikusan/);
});

test("napi kártya: elavult, hiányos, sikertelen és szöveg nélküli nap nem jóváhagyható, az ok látszik", async () => {
  const records = [
    { status: "needs_review", title: "Régi", weekId: WEEK },
    { status: "needs_review", title: "Csonka", weekId: WEEK, lastApiError: "félbeszakadt" },
  ];
  const states = ["stale", "ready", "failed", "planned"];
  const p = plan(states);
  p.days[2].error = "Gemini hiba";
  const cards = await renderCards(overview(p, records));

  assert.match(cards[0], /Elavult/);
  assert.match(cards[0], /megváltozott/);
  assert.match(cards[1], /Hiányos/);
  assert.match(cards[2], /Sikertelen/);
  assert.match(cards[2], /Gemini hiba/);
  assert.match(cards[3], /Még nincs szöveg/);
  for (const card of cards.slice(0, 4)) {
    assert.equal(/>Jóváhagyás</.test(card), false, "blokkolt nap nem kap jóváhagyó gombot");
  }
});

test("lépések: a generálási lépés a sor gombját és a napi sorokat mutatja", async () => {
  const { GenerateStep } = await import("../src/components/admin/workshop/GenerateStep");
  const ov = overview(plan(["ready", "failed"]), [{ status: "needs_review", title: "A", weekId: WEEK }]);
  const views = describeWeek(ov, new Date("2026-10-27T12:00:00Z"));
  const html = renderToStaticMarkup(
    React.createElement(GenerateStep, {
      week: WEEK,
      overview: ov,
      views,
      onChanged: noop,
      onRunningChange: () => undefined,
      onToast: () => undefined,
      onNext: () => undefined,
      onBack: () => undefined,
    })
  );
  assert.match(html, /1\/7 nap kész/);
  assert.match(html, /Folytatás — 6 hiányzó áhítat/);
});

test("ellenőrző lépés: a teljes hét jóváhagyása letiltott, ha van blokkolt nap", async () => {
  const { ReviewStep } = await import("../src/components/admin/workshop/ReviewStep");
  const ov = overview(plan(["ready", "stale"]), [
    { status: "needs_review", title: "A", weekId: WEEK },
    { status: "needs_review", title: "B", weekId: WEEK },
  ]);
  const views = describeWeek(ov, new Date("2026-10-27T12:00:00Z"));
  const html = renderToStaticMarkup(
    React.createElement(ReviewStep, {
      week: WEEK,
      overview: ov,
      views,
      onChanged: noop,
      onToast: () => undefined,
      onGoGenerate: () => undefined,
    })
  );
  const button = /<button[^>]*>Teljes hét jóváhagyása<\/button>/.exec(html)?.[0] ?? "";
  assert.match(button, /disabled/);
  assert.match(html, /nem készek/);
});

test("heti állapotsor: a terv jóváhagyása külön szerepel a publikálásra kész állapottól", async () => {
  const { WeekReadinessBanner } = await import("../src/components/admin/workshop/WeekReadinessBanner");
  const { weekReadiness } = await import("../src/lib/weekly-plan/ui-logic");

  const approvedOnly = plan([]);
  const ov = overview(approvedOnly, []);
  const views = describeWeek(ov, new Date("2026-10-27T12:00:00Z"));
  const html = renderToStaticMarkup(
    React.createElement(WeekReadinessBanner, { readiness: weekReadiness(approvedOnly, views, "2026-10-27") })
  );
  assert.match(html, /data-stage="plan-approved"/);
  assert.match(html, /még nem publikálásra kész/);
  assert.match(html, /Terv: jóváhagyva/);
  assert.match(html, /Szövegek: 0\/7 kész/);
  assert.match(html, /Jóváhagyott áhítat: 0\/7/);

  const ready = plan(Array(7).fill("ready"));
  const records = Array(7).fill({ status: "approved", title: "A", weekId: WEEK });
  const doneViews = describeWeek(overview(ready, records), new Date("2026-10-27T12:00:00Z"));
  const doneHtml = renderToStaticMarkup(
    React.createElement(WeekReadinessBanner, { readiness: weekReadiness(ready, doneViews, "2026-10-27") })
  );
  assert.match(doneHtml, /data-stage="ready-to-publish"/);
  assert.match(doneHtml, /A hét publikálásra kész/);
});

test("a terv-lépés a jóváhagyás után kimondja: a hét még nem publikálásra kész", async () => {
  const { PlanStep } = await import("../src/components/admin/workshop/PlanStep");
  const html = renderToStaticMarkup(
    React.createElement(PlanStep, {
      week: WEEK,
      overview: overview(plan([]), []),
      onChanged: noop,
      onToast: () => undefined,
      onNext: () => undefined,
    })
  );
  assert.match(html, /Terv jóváhagyva/);
  assert.match(html, /még nem publikálásra kész/);
});

test("csere-vezérlők: az állapotnak megfelelő gomb és szöveg látszik", async () => {
  const { ReplacementControls } = await import("../src/components/admin/workshop/ReplacementControls");
  const render = (view: ReturnType<typeof describeWeek>[number]) =>
    renderToStaticMarkup(
      React.createElement(ReplacementControls, {
        view,
        week: WEEK,
        busy: false,
        onChanged: noop,
        onToast: () => undefined,
      })
    );
  const now = new Date("2026-10-27T12:00:00Z");
  const foreign = { status: "published", title: "A Szív Kincsei", weekId: undefined };
  const replacement = {
    backupId: "b1",
    backupPath: "backups/x/b1.json",
    previousStatus: "published",
    previousTitle: "A Szív Kincsei",
    recordUpdatedAt: "x",
    preparedAt: "2026-10-26T08:00:00.000Z",
  };

  const p1 = plan([]);
  const prep = describeWeek(overview(p1, [foreign]), now)[0];
  const prepHtml = render(prep);
  assert.match(prepHtml, /Csere előkészítése/);
  assert.match(prepHtml, /az áhítat élő marad/);
  assert.equal(/Csere végrehajtása/.test(prepHtml), false);

  const p2 = plan([]);
  p2.days[0].replacement = replacement;
  const exec = describeWeek(overview(p2, [foreign]), now)[0];
  const execHtml = render(exec);
  assert.match(execHtml, /Csere végrehajtása/);
  assert.match(execHtml, /még <strong>élő<\/strong>/);
  assert.equal(/Csere előkészítése/.test(execHtml), false);

  const p3 = plan(["ready"]);
  p3.days[0].replacement = { ...replacement, executedAt: "2026-10-26T09:00:00.000Z" };
  const restore = describeWeek(overview(p3, [{ status: "needs_review", title: "Új", weekId: WEEK }]), now)[0];
  assert.match(render(restore), /Régi áhítat visszaállítása/);

  // sima nap: nincs vezérlő
  const normal = describeWeek(overview(plan(["ready"]), [{ status: "needs_review", title: "A", weekId: WEEK }]), now)[0];
  assert.equal(render(normal), "");
});
