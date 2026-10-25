import assert from "node:assert/strict";
import test from "node:test";
import {
  REGISTRY_RETENTION_DAYS,
  mergeRegistryEntries,
  pruneRegistry,
  registryEntriesFromPlan,
} from "../src/lib/weekly-plan/registry";
import {
  createEmptyWeeklyPlan,
  findPlanConflicts,
  getNextWeekStart,
  getWeekDates,
  getWeekStart,
  isWeekStart,
  planApprovalIssues,
  validateWeeklyPlanStructure,
  type PlanRegistry,
  type WeeklyPlan,
} from "../src/lib/weekly-plan/types";

const WEEK = "2026-10-26"; // hétfő

function filledPlan(overrides: Partial<WeeklyPlan> = {}): WeeklyPlan {
  const plan = createEmptyWeeklyPlan({
    weekId: WEEK,
    source: "gemini",
    theme: "Csendes bizalom",
    now: new Date("2026-10-23T10:00:00Z"),
  });
  const verses = [
    "Zsoltárok 23:1",
    "Máté 6:26",
    "Filippi 4:6-7",
    "Ézsaiás 41:10",
    "Róma 8:28",
    "János 14:27",
    "Zsoltárok 46:2",
  ];
  plan.days.forEach((day, i) => {
    day.title = `Cím ${i + 1}`;
    day.verse = verses[i];
    day.category = "Hit";
    day.role = `Szerep ${i + 1}`;
    day.excerpt = "Kivonat";
  });
  return { ...plan, ...overrides };
}

const EMPTY: PlanRegistry = { version: 1, entries: [] };

test("hét: hétfőtől vasárnapig, hétköznap és határok", () => {
  assert.equal(getWeekStart("2026-10-26"), "2026-10-26"); // hétfő
  assert.equal(getWeekStart("2026-10-28"), "2026-10-26"); // szerda
  assert.equal(getWeekStart("2026-11-01"), "2026-10-26"); // vasárnap még a régi héthez tartozik
  assert.equal(getWeekStart("2026-11-02"), "2026-11-02");
  assert.equal(getWeekStart("2027-01-01"), "2026-12-28"); // évforduló
  assert.equal(getWeekStart("2028-03-01"), "2028-02-28"); // szökőév
  assert.equal(isWeekStart("2026-10-26"), true);
  assert.equal(isWeekStart("2026-10-27"), false);
  assert.equal(isWeekStart("2026-02-30"), false);
});

test("hét: 7 egymást követő nap, következő hét bármelyik napról", () => {
  assert.deepEqual(getWeekDates(WEEK), [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
  assert.throws(() => getWeekDates("2026-10-27"), /nem hétfő/);

  for (const day of ["2026-10-19", "2026-10-22", "2026-10-25"]) {
    assert.equal(getNextWeekStart(day), "2026-10-26", `${day} → jövő hét hétfője`);
  }
  assert.equal(getNextWeekStart("2026-10-26"), "2026-11-02");
});

test("üres terv szerkezetileg érvényes, de nem hagyható jóvá", () => {
  const plan = createEmptyWeeklyPlan({ weekId: WEEK, source: "manual" });
  assert.deepEqual(validateWeeklyPlanStructure(plan), []);
  assert.equal(plan.days.length, 7);
  assert.equal(plan.status, "draft");

  const issues = planApprovalIssues(plan, EMPTY);
  assert.ok(issues.errors.some((e) => e.includes("téma")));
  assert.ok(issues.errors.some((e) => e.includes("hiányzik a cím")));
});

test("szerkezeti hibák: rossz hét, hiányzó vagy elcsúszott nap, ismeretlen állapot", () => {
  assert.ok(validateWeeklyPlanStructure({ ...filledPlan(), weekId: "2026-10-27" }).length > 0);

  const short = filledPlan();
  short.days = short.days.slice(0, 6);
  assert.ok(validateWeeklyPlanStructure(short).some((e) => e.includes("7 napot")));

  const shifted = filledPlan();
  shifted.days[2].date = "2026-11-05";
  assert.ok(validateWeeklyPlanStructure(shifted).some((e) => e.includes("dátuma")));

  const badState = filledPlan();
  (badState.days[0] as { state: string }).state = "kész";
  assert.ok(validateWeeklyPlanStructure(badState).some((e) => e.includes("állapot")));

  const badSource = { ...filledPlan(), source: "chatgpt" } as unknown as WeeklyPlan;
  assert.ok(validateWeeklyPlanStructure(badSource).some((e) => e.includes("forrás")));
});

test("jóváhagyás: teljes, ismétlődésmentes terv hibátlan", () => {
  const issues = planApprovalIssues(filledPlan(), EMPTY);
  assert.deepEqual(issues.errors, []);
});

test("jóváhagyás: a terven belüli azonos igehely hiba (írásmódtól függetlenül)", () => {
  const plan = filledPlan();
  plan.days[4].verse = "zsoltárok  23:1"; // ugyanaz, mint az 1. nap
  const issues = planApprovalIssues(plan, EMPTY);
  assert.ok(issues.errors.some((e) => e.includes("2026-10-30") && e.includes("ugyanaz")));
});

test("jóváhagyás: a 90 napos nyilvántartásban szereplő igehely hiba, a saját hét nem", () => {
  const registry: PlanRegistry = {
    version: 1,
    entries: [
      { date: "2026-09-20", reference: "Róma 8:28", title: "Régi áhítat", weekId: "2026-09-14" },
      // a saját hét korábbi változata: újratervezésnél nem ütközik
      { date: "2026-10-26", reference: "Zsoltárok 23:1", title: "Előző változat", weekId: WEEK },
    ],
  };
  const issues = planApprovalIssues(filledPlan(), registry);
  assert.equal(issues.errors.length, 1);
  assert.match(issues.errors[0], /2026-10-30.*2026-09-20.*Régi áhítat/);

  const conflicts = findPlanConflicts(filledPlan(), registry);
  assert.equal(conflicts.registry.length, 1);
  assert.equal(conflicts.internal.length, 0);
});

test("nyilvántartás: a 90. napnál régebbi sor kihullik, a határon lévő marad", () => {
  const today = "2026-10-26";
  const registry: PlanRegistry = {
    version: 1,
    entries: [
      { date: "2026-07-27", reference: "A 1:1", title: "határnap" }, // pontosan 91 nap → kihull
      { date: "2026-07-28", reference: "B 1:1", title: "még bent" }, // 90 nap
      { date: "2026-10-20", reference: "C 1:1", title: "friss" },
    ],
  };
  const pruned = pruneRegistry(registry, today);
  assert.equal(REGISTRY_RETENTION_DAYS, 90);
  assert.deepEqual(
    pruned.entries.map((e) => e.title),
    ["még bent", "friss"]
  );
});

test("nyilvántartás: napra egyedi összefésülés, rendezett, a tervből jönnek a sorok", () => {
  const plan = filledPlan();
  const entries = registryEntriesFromPlan(plan);
  assert.equal(entries.length, 7);
  assert.equal(entries[0].weekId, WEEK);
  assert.equal(entries[0].theme, "Csendes bizalom");

  const first = mergeRegistryEntries(EMPTY, entries, "2026-10-26");
  const replanned = mergeRegistryEntries(
    first,
    [{ date: "2026-10-26", reference: "Jób 1:1", title: "Új", weekId: WEEK }],
    "2026-10-26"
  );
  assert.equal(replanned.entries.length, 7);
  assert.equal(replanned.entries[0].reference, "Jób 1:1");
  assert.deepEqual(
    replanned.entries.map((e) => e.date),
    [...replanned.entries.map((e) => e.date)].sort()
  );
});
