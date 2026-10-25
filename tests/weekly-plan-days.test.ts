process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";
process.env.GEMINI_API_KEY = "test-key";
delete process.env.GOOGLE_API_KEY;
delete process.env.PEXELS_API_KEY;

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { addDaysToIsoDate, getAppTodayIso } from "../src/lib/app-date";
import { BODY_SYSTEM_PROMPT } from "../src/lib/prompts/devotional-body-prompt";
import { setBlobClientForTesting } from "../src/lib/storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import {
  generateWeekDay,
  GENERATING_STALE_MS,
  setWeekDevotionalApproval,
} from "../src/lib/weekly-plan/day-generation";
import {
  DayAlreadyReadyError,
  DayBusyError,
  DayConflictError,
  DayIncompleteError,
  WeeklyPlanLockedError,
} from "../src/lib/weekly-plan/errors";
import { approvePlan, importPlan } from "../src/lib/weekly-plan/service";
import { getWeeklyPlanStore } from "../src/lib/weekly-plan/store";
import { getNextWeekStart, getWeekStart } from "../src/lib/weekly-plan/types";
import { FULL_BODY, TRUNCATED_BODY, installGeminiStub, planJson } from "./helpers/gemini-stub";

const TODAY = getAppTodayIso();
const THIS_WEEK = getWeekStart(TODAY);
const NEXT_WEEK = getNextWeekStart(TODAY);
const gemini = installGeminiStub();

beforeEach(() => {
  setBlobClientForTesting(new MemoryBlobClient());
  gemini.reset();
});
afterEach(() => gemini.reset());

function days(weekId: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToIsoDate(weekId, i));
}

async function approvedPlan(weekId = NEXT_WEEK) {
  const imported = await importPlan({ weekId, text: planJson() });
  const approved = await approvePlan({ weekId, expectedUpdatedAt: imported.plan.updatedAt });
  return approved.plan;
}

async function dayState(weekId: string, date: string) {
  return (await getWeeklyPlanStore().getPlan(weekId))!.days.find((d) => d.date === date)!;
}

test("nap generálása: a terv adataival, heti kontextussal, a szöveg-prompt rendszerszövege változatlan", async () => {
  await approvedPlan();
  const [monday, tuesday] = days(NEXT_WEEK);
  gemini.bodyReplies.push({ text: FULL_BODY });

  const result = await generateWeekDay({ weekId: NEXT_WEEK, date: monday });

  assert.equal(result.regenerated, false);
  assert.equal(result.devotional.date, monday);
  assert.equal(result.devotional.weekId, NEXT_WEEK);
  assert.equal(result.devotional.status, "needs_review", "szerkesztői jóváhagyásig ellenőrzésre vár");
  assert.equal(result.devotional.title, "Cím 1");
  assert.match(result.devotional.verse, /^Zsoltárok 23:1/);
  assert.match(result.devotional.content, /Elmélkedés/);
  assert.equal(result.devotional.lastApiError, undefined);
  assert.equal(result.devotional.facebookCopy, "Kivonat 1");

  const call = gemini.bodyCalls()[0];
  assert.equal(call.system, BODY_SYSTEM_PROMPT, "a bevált szöveg-prompt rendszerszövege nem módosult");
  assert.match(call.user, /Cím 1/);
  assert.match(call.user, /HETI SOROZAT KONTEXTUSA/);
  assert.match(call.user, /Csendes bizalom/);
  assert.match(call.user, /Kedd: Cím 2/, "a többi nap is szerepel (ismétlés ellen)");
  assert.equal(call.user.includes("Hétfő: Cím 1"), false, "a saját napot nem sorolja a többi közé");

  assert.equal((await dayState(NEXT_WEEK, monday)).state, "ready");
  assert.equal((await dayState(NEXT_WEEK, tuesday)).state, "planned");
});

test("a megszakadt nap nem mentődik, csak a saját állapota 'failed'; a kész napok érintetlenek; folytatható", async () => {
  await approvedPlan();
  const [monday, tuesday, wednesday] = days(NEXT_WEEK);

  gemini.bodyReplies.push({ text: FULL_BODY });
  const first = await generateWeekDay({ weekId: NEXT_WEEK, date: monday });

  // A kedd mindkét próbálkozása megszakad.
  gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });
  gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });
  await assert.rejects(generateWeekDay({ weekId: NEXT_WEEK, date: tuesday }), DayIncompleteError);

  const failed = await dayState(NEXT_WEEK, tuesday);
  assert.equal(failed.state, "failed");
  assert.match(failed.error ?? "", /hiányos|félbeszakadt/);
  const { getDevotionalByDate } = await import("../src/lib/devotionals");
  assert.equal(await getDevotionalByDate(tuesday), undefined, "hiányos szöveg nem kerül a tárolóba");

  // A hétfő szövege és állapota érintetlen.
  assert.equal((await dayState(NEXT_WEEK, monday)).state, "ready");
  assert.equal((await getDevotionalByDate(monday))?.content, first.devotional.content);

  // A szerda független; a kedd újra megpróbálható.
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: NEXT_WEEK, date: wednesday });
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: NEXT_WEEK, date: tuesday });

  const plan = (await getWeeklyPlanStore().getPlan(NEXT_WEEK))!;
  assert.deepEqual(
    plan.days.map((d) => d.state),
    ["ready", "ready", "ready", "planned", "planned", "planned", "planned"]
  );
  assert.equal(plan.days[1].error, undefined, "a sikeres újrapróba törli a hibát");
});

test("Gemini API-hiba (HTTP 500) egy napon: a nap 'failed', a többi érintetlen", async () => {
  await approvedPlan();
  const [monday, tuesday] = days(NEXT_WEEK);
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: NEXT_WEEK, date: monday });

  gemini.bodyReplies.push({ httpStatus: 500 });
  await assert.rejects(generateWeekDay({ weekId: NEXT_WEEK, date: tuesday }));
  assert.equal((await dayState(NEXT_WEEK, tuesday)).state, "failed");
  assert.equal((await dayState(NEXT_WEEK, monday)).state, "ready");
});

test("kész nap véletlen újragenerálása tiltott; kifejezett kéréssel verziót ment és újra ellenőrzésre áll", async () => {
  await approvedPlan();
  const monday = days(NEXT_WEEK)[0];
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: NEXT_WEEK, date: monday });
  const callsBefore = gemini.bodyCalls().length;

  await assert.rejects(generateWeekDay({ weekId: NEXT_WEEK, date: monday }), DayAlreadyReadyError);
  assert.equal(gemini.bodyCalls().length, callsBefore, "elutasításnál nincs Gemini-hívás");

  // Jóváhagyás után kényszerített újragenerálás: a státusz visszaáll ellenőrzésre.
  await setWeekDevotionalApproval({ weekId: NEXT_WEEK, approve: true, dates: [monday] });
  gemini.bodyReplies.push({ text: FULL_BODY.replace("csendes jelenléte", "csendes közelsége") });
  const regenerated = await generateWeekDay({ weekId: NEXT_WEEK, date: monday, force: true });
  assert.equal(regenerated.regenerated, true);
  assert.equal(regenerated.devotional.status, "needs_review");
  assert.equal(regenerated.devotional.versionHistory?.length, 1, "a régi változat megmaradt");
});

test("párhuzamos kettős indítás: csak az egyik fut, egyetlen Gemini-hívás", async () => {
  await approvedPlan();
  const monday = days(NEXT_WEEK)[0];
  gemini.bodyReplies.push({ text: FULL_BODY });
  gemini.bodyReplies.push({ text: FULL_BODY });

  const results = await Promise.allSettled([
    generateWeekDay({ weekId: NEXT_WEEK, date: monday }),
    generateWeekDay({ weekId: NEXT_WEEK, date: monday }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof DayBusyError || rejected.reason instanceof DayAlreadyReadyError);
  assert.equal(gemini.bodyCalls().length, 1);
});

test("elakadt 'generating' állapot a határidő után újraindítható, a friss nem", async () => {
  await approvedPlan();
  const monday = days(NEXT_WEEK)[0];
  const now = new Date("2026-10-26T12:00:00.000Z");

  const mark = async (startedAt: string) =>
    getWeeklyPlanStore().updatePlan(NEXT_WEEK, (p) => ({
      ...p,
      days: p.days.map((d) =>
        d.date === monday ? { ...d, state: "generating", lastAttemptAt: startedAt } : d
      ),
    }));

  await mark(new Date(now.getTime() - 60_000).toISOString());
  await assert.rejects(
    generateWeekDay({ weekId: NEXT_WEEK, date: monday, now: () => now }),
    DayBusyError
  );

  await mark(new Date(now.getTime() - GENERATING_STALE_MS - 1000).toISOString());
  gemini.bodyReplies.push({ text: FULL_BODY });
  const result = await generateWeekDay({ weekId: NEXT_WEEK, date: monday, now: () => now });
  assert.equal(result.devotional.date, monday);
});

test("a félbeszakadt futásból megmaradt teljes szöveg nem generálódik újra (egyeztetés)", async () => {
  await approvedPlan();
  const monday = days(NEXT_WEEK)[0];
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: NEXT_WEEK, date: monday });

  // A rekord megvan, de a terv állapota elveszett (pl. megszakadt mentés).
  await getWeeklyPlanStore().updatePlan(NEXT_WEEK, (p) => ({
    ...p,
    days: p.days.map((d) => (d.date === monday ? { ...d, state: "failed", error: "valami" } : d)),
  }));
  const calls = gemini.bodyCalls().length;

  const result = await generateWeekDay({ weekId: NEXT_WEEK, date: monday });
  assert.equal(result.reconciled, true);
  assert.equal(gemini.bodyCalls().length, calls, "nem hívtuk a Geminit");
  assert.equal((await dayState(NEXT_WEEK, monday)).state, "ready");
});

test("a más forrásból (régi napi folyamat) származó áhítatot soha nem írja felül", async () => {
  await approvedPlan();
  const monday = days(NEXT_WEEK)[0];
  const { appendDevotional, getDevotionalByDate } = await import("../src/lib/devotionals");
  await appendDevotional({
    date: monday,
    title: "Régi napi áhítat",
    verse: "Ján 3:16 — ...",
    content: "Szöveg",
    imageUrl: "",
    createdAt: `${monday}T00:00:00.000Z`,
    status: "published",
  });

  await assert.rejects(generateWeekDay({ weekId: NEXT_WEEK, date: monday, force: true }), DayConflictError);
  assert.equal((await getDevotionalByDate(monday))?.title, "Régi napi áhítat");
  assert.equal(gemini.bodyCalls().length, 0);
});

test("jóváhagyott terv nélkül és idegen nappal nem generál", async () => {
  const imported = await importPlan({ weekId: NEXT_WEEK, text: planJson() });
  await assert.rejects(
    generateWeekDay({ weekId: NEXT_WEEK, date: days(NEXT_WEEK)[0] }),
    WeeklyPlanLockedError
  );
  await approvePlan({ weekId: NEXT_WEEK, expectedUpdatedAt: imported.plan.updatedAt });
  await assert.rejects(
    generateWeekDay({ weekId: NEXT_WEEK, date: "2020-01-06" }),
    /nem tartozik/
  );
  assert.equal(gemini.calls.length, 0);
});

test("jóváhagyás: csak az elkészült, teljes szöveg hagyható jóvá; a jövőbeli nap a saját napjáig rejtve marad", async () => {
  // Az aktuális hét: a mai nap jóváhagyva azonnal látszik, a holnapi nem.
  const monday = THIS_WEEK;
  await approvedPlan(THIS_WEEK);
  const weekDates = days(THIS_WEEK);
  const todayIdx = weekDates.indexOf(TODAY);
  const tomorrow = weekDates[todayIdx + 1];
  const targets = [TODAY, ...(tomorrow ? [tomorrow] : [])];

  for (const date of targets) {
    gemini.bodyReplies.push({ text: FULL_BODY });
    await generateWeekDay({ weekId: THIS_WEEK, date });
  }
  const { getPublicWindowDevotionals } = await import("../src/lib/devotionals");
  assert.equal((await getPublicWindowDevotionals()).length, 0, "jóváhagyás előtt semmi nem nyilvános");

  const outcome = await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true });
  assert.deepEqual([...outcome.changed].sort(), [...targets].sort());
  assert.ok(
    outcome.skipped.every((s) => s.reason.includes("Még nincs elkészült szöveg")),
    "a nem generált napokat átugorja"
  );

  const visible = await getPublicWindowDevotionals();
  assert.deepEqual(visible.map((d) => d.date), [TODAY], "csak a mai nap látszik, a holnapi a saját napjáig rejtve");

  // Visszavonás: a mai nap újra rejtett.
  const revoked = await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: false, dates: [TODAY] });
  assert.deepEqual(revoked.changed, [TODAY]);
  assert.equal((await getPublicWindowDevotionals()).length, 0);
  void monday;
});
