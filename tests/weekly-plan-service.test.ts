process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";
process.env.GEMINI_API_KEY = "test-key";
delete process.env.GOOGLE_API_KEY;
delete process.env.PEXELS_API_KEY;

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { addDaysToIsoDate, getAppTodayIso } from "../src/lib/app-date";
import { setBlobClientForTesting } from "../src/lib/storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import {
  WeeklyPlanConflictError,
  WeeklyPlanGenerationError,
  WeeklyPlanInputError,
  WeeklyPlanLockedError,
  WeeklyPlanNotApprovableError,
} from "../src/lib/weekly-plan/errors";
import { PlanParseError } from "../src/lib/weekly-plan/parse";
import {
  approvePlan,
  assertWeekEditable,
  deletePlanDraft,
  importPlan,
  patchPlan,
  proposePlan,
  reopenPlan,
  revisePlan,
} from "../src/lib/weekly-plan/service";
import { getWeeklyPlanStore } from "../src/lib/weekly-plan/store";
import { getNextWeekStart, getWeekStart } from "../src/lib/weekly-plan/types";
import { installGeminiStub, planJson } from "./helpers/gemini-stub";

const TODAY = getAppTodayIso();
const NEXT_WEEK = getNextWeekStart(TODAY);
const gemini = installGeminiStub();

beforeEach(() => {
  setBlobClientForTesting(new MemoryBlobClient());
  gemini.reset();
});

afterEach(() => {
  gemini.reset();
});

function days(weekId: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToIsoDate(weekId, i));
}

// ── a hét szerkeszthetősége ─────────────────────────────────────────────────

test("hét: múltbeli, túl távoli és nem hétfői hét nem szerkeszthető", () => {
  assert.doesNotThrow(() => assertWeekEditable(getWeekStart(TODAY)));
  assert.doesNotThrow(() => assertWeekEditable(NEXT_WEEK));
  assert.throws(() => assertWeekEditable(addDaysToIsoDate(getWeekStart(TODAY), -7)), /lezárult/);
  assert.throws(() => assertWeekEditable(addDaysToIsoDate(getWeekStart(TODAY), 7 * 20)), /előre/);
  assert.throws(() => assertWeekEditable(addDaysToIsoDate(NEXT_WEEK, 1)), WeeklyPlanInputError);
});

// ── tervezés témából / briefből ─────────────────────────────────────────────

test("terv témából: Gemini-javaslat, a nyilvántartott igehelyek a promptban, vázlat státusszal", async () => {
  const store = getWeeklyPlanStore();
  await store.recordInRegistry([
    { date: addDaysToIsoDate(TODAY, -10), reference: "Jeremiás 29:11", title: "Régebbi" },
  ]);
  gemini.planReplies.push({ text: planJson() });

  const result = await proposePlan({ weekId: NEXT_WEEK, theme: "Bizalom a nehéz időkben" });

  assert.equal(result.plan.status, "draft");
  assert.equal(result.plan.source, "gemini");
  assert.equal(result.plan.theme, "Csendes bizalom");
  assert.equal(result.plan.days.length, 7);
  assert.deepEqual(result.plan.days.map((d) => d.date), days(NEXT_WEEK));
  assert.ok(result.plan.days.every((d) => d.state === "planned"));
  assert.deepEqual(result.issues.errors, []);

  assert.equal(gemini.planCalls().length, 1);
  const call = gemini.planCalls()[0];
  assert.match(call.user, /Bizalom a nehéz időkben/);
  assert.match(call.user, /Jeremiás 29:11/);
  assert.equal((await store.getPlan(NEXT_WEEK))?.theme, "Csendes bizalom");
});

test("terv briefből: a brief a promptba kerül, a forrás 'brief'", async () => {
  gemini.planReplies.push({ text: planJson({ theme: "Hála" }) });
  const result = await proposePlan({
    weekId: NEXT_WEEK,
    brief: "Hétfőn feltétlenül a Zsoltárok 100 legyen. A hét a hálaadásról szóljon.",
  });
  assert.equal(result.plan.source, "brief");
  assert.match(gemini.planCalls()[0].user, /Zsoltárok 100 legyen/);
});

test("terv: téma vagy brief nélkül és túl hosszú bemenettel hiba, Gemini-hívás nélkül", async () => {
  await assert.rejects(proposePlan({ weekId: NEXT_WEEK }), WeeklyPlanInputError);
  await assert.rejects(
    proposePlan({ weekId: NEXT_WEEK, theme: "x".repeat(501) }),
    /legfeljebb 500/
  );
  assert.equal(gemini.calls.length, 0);
});

test("terv: a megszakadt vagy hibás JSON-nál egyszer újrapróbál, nagyobb kerettel", async () => {
  gemini.planReplies.push({ text: '{"theme": "Fél', finishReason: "MAX_TOKENS" });
  gemini.planReplies.push({ text: planJson() });
  const result = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });

  assert.equal(result.plan.days.length, 7);
  const [first, second] = gemini.planCalls();
  assert.ok(second.maxOutputTokens! > first.maxOutputTokens!);
  assert.ok(second.thinkingBudget! < first.thinkingBudget!);
});

test("terv: két rossz válasz után hiba, és nem keletkezik terv", async () => {
  gemini.planReplies.push({ text: "nem json" });
  gemini.planReplies.push({ text: '{"theme":"x","days":[]}' });
  await assert.rejects(proposePlan({ weekId: NEXT_WEEK, theme: "Téma" }), WeeklyPlanGenerationError);
  assert.equal(gemini.planCalls().length, 2);
  assert.equal(await getWeeklyPlanStore().getPlan(NEXT_WEEK), null);
});

// ── ismétlődések ────────────────────────────────────────────────────────────

test("terven belüli ismétlődő igehely: egy automatikus javító kör kiszűri", async () => {
  const dup = ["Zsoltárok 23:1", "Máté 6:26", "Zsoltárok 23:1", "Ézsaiás 41:10", "Róma 8:28", "János 14:27", "Zsoltárok 46:2"];
  gemini.planReplies.push({ text: planJson({ verses: dup }) });
  gemini.planReplies.push({ text: planJson() }); // a javított változat

  const result = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });
  assert.equal(result.repaired, true);
  assert.equal(gemini.planCalls().length, 2);
  assert.match(gemini.planCalls()[1].user, /ugyanaz, mint/);
  assert.deepEqual(result.issues.errors, []);
});

test("ha a javítás sem sikerül, az ismétlés megmarad és a jóváhagyást blokkolja (nincs végtelen kör)", async () => {
  const dup = ["Zsoltárok 23:1", "Máté 6:26", "Zsoltárok 23:1", "Ézsaiás 41:10", "Róma 8:28", "János 14:27", "Zsoltárok 46:2"];
  gemini.planReplies.push({ text: planJson({ verses: dup }) });
  gemini.planReplies.push({ text: planJson({ verses: dup }) });

  const result = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });
  assert.equal(gemini.planCalls().length, 2);
  assert.ok(result.issues.errors.some((e) => e.includes("ugyanaz")));
  await assert.rejects(
    approvePlan({ weekId: NEXT_WEEK, expectedUpdatedAt: result.plan.updatedAt }),
    WeeklyPlanNotApprovableError
  );
});

test("90 napon belül használt igehely: figyelmeztet, szerkesztői döntéssel felülbírálható; a terven belüli ismétlés nem", async () => {
  const store = getWeeklyPlanStore();
  await store.recordInRegistry([
    { date: addDaysToIsoDate(TODAY, -20), reference: "Róma 8:28", title: "Korábbi áhítat", weekId: "x" },
  ]);
  const verses = ["Zsoltárok 23:1", "Máté 6:26", "Filippi 4:6-7", "Ézsaiás 41:10", "Róma 8:28", "János 14:27", "Zsoltárok 46:2"];
  gemini.planReplies.push({ text: planJson({ verses }) });
  gemini.planReplies.push({ text: planJson({ verses }) }); // a javítás is ugyanazt adja

  const proposed = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });
  const friday = days(NEXT_WEEK)[4];
  assert.ok(proposed.issues.errors.some((e) => e.includes(friday) && e.includes("Korábbi áhítat")));

  // Felülbírálás nélkül nem hagyható jóvá.
  await assert.rejects(
    approvePlan({ weekId: NEXT_WEEK, expectedUpdatedAt: proposed.plan.updatedAt }),
    WeeklyPlanNotApprovableError
  );

  // Szerkesztői döntéssel igen — figyelmeztetésként megmarad.
  const approved = await approvePlan({
    weekId: NEXT_WEEK,
    expectedUpdatedAt: proposed.plan.updatedAt,
    overrideRepeats: [friday],
  });
  assert.equal(approved.plan.status, "approved");
  assert.deepEqual(approved.plan.repeatOverrides, [friday]);
  assert.ok(approved.issues.warnings.some((w) => w.includes("Szerkesztői döntéssel")));
});

test("a felülbírálás a terven belüli ismétlést nem oldja fel", async () => {
  const dup = ["Zsoltárok 23:1", "Máté 6:26", "Zsoltárok 23:1", "Ézsaiás 41:10", "Róma 8:28", "János 14:27", "Zsoltárok 46:2"];
  gemini.planReplies.push({ text: planJson({ verses: dup }) });
  gemini.planReplies.push({ text: planJson({ verses: dup }) });
  const proposed = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });

  await assert.rejects(
    approvePlan({
      weekId: NEXT_WEEK,
      expectedUpdatedAt: proposed.plan.updatedAt,
      overrideRepeats: days(NEXT_WEEK),
    }),
    WeeklyPlanNotApprovableError
  );
});

// ── finomítás természetes nyelven ───────────────────────────────────────────

test("finomítás: a jelenlegi tervből indul, az érintetlen napok változatlanok, az érintettek újra 'planned'", async () => {
  gemini.planReplies.push({ text: planJson() });
  const first = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });

  // A csütörtöki nap szövege már elkészült; a módosítás ezt elavulttá teszi.
  const thursday = days(NEXT_WEEK)[3];
  await getWeeklyPlanStore().updatePlan(NEXT_WEEK, (p) => ({
    ...p,
    days: p.days.map((d) => (d.date === thursday ? { ...d, state: "ready" } : d)),
  }));
  const current = (await getWeeklyPlanStore().getPlan(NEXT_WEEK))!;

  const revisedJson = JSON.parse(planJson());
  revisedJson.days[3].title = "Új csütörtöki cím";
  revisedJson.days[3].verse = "Jakab 1:5 — ha valakinek hiányzik bölcsesség";
  gemini.planReplies.push({ text: JSON.stringify(revisedJson) });

  const result = await revisePlan({
    weekId: NEXT_WEEK,
    instruction: "A csütörtök legyen a bölcsességről.",
    expectedUpdatedAt: current.updatedAt,
  });

  const prompt = gemini.planCalls()[1].user;
  assert.match(prompt, /JELENLEGI TERV/);
  assert.match(prompt, /Cím 1/, "a prompt a korábbi tervet tartalmazza");
  assert.match(prompt, /A csütörtök legyen a bölcsességről/);

  assert.equal(result.plan.days[3].title, "Új csütörtöki cím");
  assert.equal(result.plan.days[3].state, "planned");
  assert.deepEqual(result.staleDates, [thursday]);
  assert.equal(result.plan.days[0].title, first.plan.days[0].title, "érintetlen nap változatlan");
  assert.equal(result.plan.createdAt, first.plan.createdAt);
});

test("finomítás: elavult időbélyeggel 409-es ütközés, jóváhagyott tervre zárolt", async () => {
  gemini.planReplies.push({ text: planJson() });
  const first = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });

  await assert.rejects(
    revisePlan({ weekId: NEXT_WEEK, instruction: "Valami", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }),
    WeeklyPlanConflictError
  );
  await assert.rejects(
    revisePlan({ weekId: NEXT_WEEK, instruction: "Valami" }),
    /expectedUpdatedAt/
  );
  assert.equal(gemini.planCalls().length, 1, "elutasított kérésnél nincs Gemini-hívás");

  const approved = await approvePlan({ weekId: NEXT_WEEK, expectedUpdatedAt: first.plan.updatedAt });
  await assert.rejects(
    revisePlan({ weekId: NEXT_WEEK, instruction: "Valami", expectedUpdatedAt: approved.plan.updatedAt }),
    WeeklyPlanLockedError
  );
});

test("finomítás közben érkezett másik módosítás nem íródik felül", async () => {
  gemini.planReplies.push({ text: planJson() });
  const first = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });

  // A Gemini-hívás közben egy másik szerkesztő módosít.
  gemini.planReplies.push({ text: planJson({ theme: "Gemini témája" }) });
  gemini.hooks.beforePlanReply = async () => {
    await getWeeklyPlanStore().updatePlan(NEXT_WEEK, (p) => ({ ...p, theme: "Kézzel írt téma" }));
  };
  await assert.rejects(
    revisePlan({ weekId: NEXT_WEEK, instruction: "Változtass", expectedUpdatedAt: first.plan.updatedAt }),
    WeeklyPlanConflictError
  );
  assert.equal((await getWeeklyPlanStore().getPlan(NEXT_WEEK))?.theme, "Kézzel írt téma");
});

// ── ChatGPT-brief beillesztése ──────────────────────────────────────────────

test("strukturált JSON-terv közvetlenül betölthető Gemini-hívás nélkül (kódblokkal, kommenttel)", async () => {
  const text = "```json\n// ChatGPT terv\n" + planJson({ theme: "ChatGPT-s hét" }) + "\n```";
  const result = await importPlan({ weekId: NEXT_WEEK, text });

  assert.equal(gemini.calls.length, 0);
  assert.equal(result.plan.source, "brief");
  assert.equal(result.plan.theme, "ChatGPT-s hét");
  assert.deepEqual(result.issues.errors, []);
  assert.equal(result.plan.days[0].imageKeywords, "sunrise, path");
});

test("címkézett szöveges formátum is betölthető", async () => {
  const lines = [
    "Téma: Hála",
    "Ív: A panaszból a hálaadásig.",
    ...["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"].map(
      (d, i) => `- ${d} | Cím ${i + 1} | Zsoltárok ${100 + i}:1 — ige | Szerep ${i + 1} | Hála | gratitude, light`
    ),
  ].join("\n");
  const result = await importPlan({ weekId: NEXT_WEEK, text: lines });
  assert.equal(result.plan.theme, "Hála");
  assert.equal(result.plan.days[6].verse, "Zsoltárok 106:1 — ige");
  assert.equal(result.plan.days[2].category, "Hála");
  assert.equal(gemini.calls.length, 0);
});

test("nem strukturált szöveg nem töltődik be: hiánylista, és nem keletkezik terv", async () => {
  await assert.rejects(
    importPlan({ weekId: NEXT_WEEK, text: "Legyen egy békés hét, valami a bizalomról." }),
    (error) => {
      assert.ok(error instanceof PlanParseError);
      assert.ok(error.problems.length > 0);
      return true;
    }
  );
  assert.equal(await getWeeklyPlanStore().getPlan(NEXT_WEEK), null);
  assert.equal(gemini.calls.length, 0);
});

test("betöltött terv ismétlődése jelezve van, a jóváhagyás szerkesztői döntést kér", async () => {
  const dup = ["Zsoltárok 23:1", "Máté 6:26", "Zsoltárok 23:1", "Ézsaiás 41:10", "Róma 8:28", "János 14:27", "Zsoltárok 46:2"];
  const result = await importPlan({ weekId: NEXT_WEEK, text: planJson({ verses: dup }) });
  assert.ok(result.issues.errors.some((e) => e.includes("ugyanaz")));
});

// ── kézi szerkesztés és életciklus ──────────────────────────────────────────

test("kézi szerkesztés: mezők, korlátok, érvénytelen nap, elavult időbélyeg", async () => {
  gemini.planReplies.push({ text: planJson() });
  const first = await proposePlan({ weekId: NEXT_WEEK, theme: "Téma" });
  const monday = days(NEXT_WEEK)[0];

  const edited = await patchPlan({
    weekId: NEXT_WEEK,
    expectedUpdatedAt: first.plan.updatedAt,
    patch: {
      theme: "Kézi téma",
      days: [{ date: monday, title: "Kézi cím", imageKeywords: "a, b, c, d, e, f" }],
    },
  });
  assert.equal(edited.plan.theme, "Kézi téma");
  assert.equal(edited.plan.days[0].title, "Kézi cím");
  assert.equal(edited.plan.days[0].imageKeywords?.split(",").length, 4, "max 4 kulcsszó");
  assert.equal(edited.plan.days[1].title, first.plan.days[1].title);

  await assert.rejects(
    patchPlan({ weekId: NEXT_WEEK, expectedUpdatedAt: edited.plan.updatedAt, patch: { theme: "x".repeat(201) } }),
    /legfeljebb 200/
  );
  await assert.rejects(
    patchPlan({
      weekId: NEXT_WEEK,
      expectedUpdatedAt: edited.plan.updatedAt,
      patch: { days: [{ date: "2020-01-06", title: "Rossz nap" }] },
    }),
    /nem tartozik/
  );
  await assert.rejects(
    patchPlan({ weekId: NEXT_WEEK, expectedUpdatedAt: first.plan.updatedAt, patch: { theme: "Másik" } }),
    WeeklyPlanConflictError
  );
  await assert.rejects(
    patchPlan({ weekId: NEXT_WEEK, expectedUpdatedAt: edited.plan.updatedAt, patch: {} }),
    /Nincs módosítandó/
  );
});

test("jóváhagyás: hiányos tervnél hibalista, jóváhagyás után nyilvántartás, visszanyitás és törlés szabályai", async () => {
  const empty = await importPlan({
    weekId: NEXT_WEEK,
    text: planJson().replace('"theme":"Csendes bizalom"', '"theme":"Valami"'),
  });
  // Egy nap címének törlése → nem hagyható jóvá.
  const broken = await patchPlan({
    weekId: NEXT_WEEK,
    expectedUpdatedAt: empty.plan.updatedAt,
    patch: { days: [{ date: days(NEXT_WEEK)[2], title: "" }] },
  });
  await assert.rejects(
    approvePlan({ weekId: NEXT_WEEK, expectedUpdatedAt: broken.plan.updatedAt }),
    (error) => {
      assert.ok(error instanceof WeeklyPlanNotApprovableError);
      assert.ok(error.issues.errors.some((e) => e.includes("hiányzik a cím")));
      return true;
    }
  );

  const fixed = await patchPlan({
    weekId: NEXT_WEEK,
    expectedUpdatedAt: broken.plan.updatedAt,
    patch: { days: [{ date: days(NEXT_WEEK)[2], title: "Javított cím" }] },
  });
  const approved = await approvePlan({ weekId: NEXT_WEEK, expectedUpdatedAt: fixed.plan.updatedAt });
  assert.equal(approved.plan.status, "approved");
  assert.ok(approved.plan.approvedAt);
  const registry = await getWeeklyPlanStore().getRegistry();
  assert.equal(registry.entries.filter((e) => e.weekId === NEXT_WEEK).length, 7);

  // Jóváhagyott terv nem szerkeszthető, nem törölhető; visszanyitás után igen.
  await assert.rejects(
    patchPlan({ weekId: NEXT_WEEK, expectedUpdatedAt: approved.plan.updatedAt, patch: { theme: "X" } }),
    WeeklyPlanLockedError
  );
  await assert.rejects(
    deletePlanDraft({ weekId: NEXT_WEEK, expectedUpdatedAt: approved.plan.updatedAt }),
    WeeklyPlanLockedError
  );
  const reopened = await reopenPlan({ weekId: NEXT_WEEK, expectedUpdatedAt: approved.plan.updatedAt });
  assert.equal(reopened.plan.status, "draft");

  await deletePlanDraft({ weekId: NEXT_WEEK, expectedUpdatedAt: reopened.plan.updatedAt });
  assert.equal(await getWeeklyPlanStore().getPlan(NEXT_WEEK), null);
});

test("elkészült nappal rendelkező terv nem cserélhető újratervezéssel és nem törölhető", async () => {
  const imported = await importPlan({ weekId: NEXT_WEEK, text: planJson() });
  await getWeeklyPlanStore().updatePlan(NEXT_WEEK, (p) => ({
    ...p,
    days: p.days.map((d, i) => (i === 0 ? { ...d, state: "ready" } : d)),
  }));
  const current = (await getWeeklyPlanStore().getPlan(NEXT_WEEK))!;

  await assert.rejects(importPlan({ weekId: NEXT_WEEK, text: planJson() }), WeeklyPlanLockedError);
  await assert.rejects(proposePlan({ weekId: NEXT_WEEK, theme: "Új" }), WeeklyPlanLockedError);
  await assert.rejects(
    deletePlanDraft({ weekId: NEXT_WEEK, expectedUpdatedAt: current.updatedAt }),
    WeeklyPlanLockedError
  );
  assert.equal(imported.plan.days.length, 7);
  assert.equal(gemini.calls.length, 0);
});
