process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";
process.env.GEMINI_API_KEY = "test-key";
process.env.VERCEL_ENV = "production"; // a cron csak production környezetben fut automatikusan
delete process.env.GOOGLE_API_KEY;
delete process.env.PEXELS_API_KEY;

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import { addDaysToIsoDate, getAppTodayIso } from "../src/lib/app-date";
import { setAdminAuthForTesting } from "../src/lib/auth";
import { computeCoverage, MAX_DAILY_ATTEMPTS } from "../src/lib/autopilot/coverage";
import { runAutopilot } from "../src/lib/autopilot/run";
import {
  AUTOPILOT_PATH,
  LOCK_STALE_MS,
  readAutopilotState,
  setAutopilotEnabled,
} from "../src/lib/autopilot/state";
import { runDailyCronGeneration } from "../src/lib/cron-generate-devotional";
import {
  appendDevotional,
  getDevotionalByDate,
  getPublicWindowDevotionals,
  updateDevotionalStatus,
} from "../src/lib/devotionals";
import { processDueGenerationRetries } from "../src/lib/generation-job-runner";
import { setBlobClientForTesting } from "../src/lib/storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { generateWeekDay, setWeekDevotionalApproval } from "../src/lib/weekly-plan/day-generation";
import { approvePlan, handToAutopilot, importPlan, proposePlan, reopenPlan } from "../src/lib/weekly-plan/service";
import { getWeeklyPlanStore } from "../src/lib/weekly-plan/store";
import { getWeekStart } from "../src/lib/weekly-plan/types";
import { FULL_BODY, TRUNCATED_BODY, installGeminiStub, planJson } from "./helpers/gemini-stub";

const TODAY = getAppTodayIso();
const THIS_WEEK = getWeekStart(TODAY);
const gemini = installGeminiStub();
let blob: MemoryBlobClient;

const VERSES_A = ["Zsoltárok 51:3", "1 János 1:9", "Lukács 15:18", "Joel 2:13", "Máté 3:2", "Jakab 4:8", "Róma 2:4"];
const VERSES_B = ["Ézsaiás 55:6", "Hóseás 14:2", "Mikeás 7:18", "Apostolok 3:19", "2 Korinthus 7:10", "Zsoltárok 32:5", "Példabeszédek 28:13"];

beforeEach(() => {
  blob = new MemoryBlobClient();
  setBlobClientForTesting(blob);
  setAdminAuthForTesting(async () => true);
  gemini.reset();
});
afterEach(() => {
  setAdminAuthForTesting(null);
  gemini.reset();
});

/** Két heti tervre és bőven elég szövegre elegendő hamis Gemini-válasz (a hétváltástól függetlenül). */
function queueHappyGemini(bodies = 8) {
  gemini.planReplies.push({ text: planJson({ verses: VERSES_A, theme: "Bűnbánat" }) });
  gemini.planReplies.push({ text: planJson({ verses: VERSES_B, theme: "Megtérés" }) });
  for (let i = 0; i < bodies; i++) gemini.bodyReplies.push({ text: FULL_BODY });
}

const run = (overrides: Partial<Parameters<typeof runAutopilot>[0]> = {}) =>
  runAutopilot({ trigger: "test", ...overrides });

async function states() {
  return (await computeCoverage({ today: TODAY })).map((c) => c.state);
}

test("alapból ki van kapcsolva: a futás semmit nem csinál, nincs Gemini-hívás", async () => {
  assert.equal((await readAutopilotState()).enabled, false);
  const summary = await run();
  assert.equal(summary.outcome, "disabled");
  assert.equal(gemini.calls.length, 0);
  assert.equal(await getWeeklyPlanStore().getPlan(THIS_WEEK), null);
});

test("üres rendszerből: heti terv + a háromnapos tartalék feltöltése; a mai nap azonnal, a későbbiek a saját napjukon látszanak", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();

  const first = await run();
  assert.equal(first.generated, 2, "futásonként legfeljebb 2 nap");
  assert.equal(first.approved, 2);
  assert.ok(first.plansCreated >= 1);
  assert.ok(first.todayCovered);

  const plan = await getWeeklyPlanStore().getPlan(THIS_WEEK);
  assert.equal(plan?.source, "auto");
  assert.equal(plan?.status, "approved");

  const second = await run();
  assert.equal(second.generated, 2);
  const third = await run();
  assert.equal(third.generated, 0, "ha minden kész, nincs mit pótolni");

  assert.deepEqual(await states(), ["covered", "covered", "covered", "covered"]);
  assert.equal(third.reserveDays, 3);
  assert.equal(gemini.bodyCalls().length, 4, "pontosan 4 szöveg készült");

  const today = await getDevotionalByDate(TODAY);
  assert.equal(today?.status, "approved");
  assert.ok(today?.weekId);
  assert.equal(today?.facebookCopy ? true : false, true, "a Facebook-ajánló is megvan");
  assert.deepEqual((await getPublicWindowDevotionals()).map((d) => d.date), [TODAY], "a jövőbeli napok még rejtettek");
});

test("a kész tartalékra újabb futás Gemini-hívás nélkül lefut (egy rendes nap költsége)", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();
  await run();
  await run();
  gemini.reset();
  const idle = await run();
  assert.equal(idle.outcome, "ok");
  assert.equal(gemini.calls.length, 0);
});

test("hiányos (félbeszakadt) szöveg nem mentődik és nem hagyódik jóvá; a kísérlet számlálódik; két hiba után megáll", async () => {
  await setAutopilotEnabled(true);
  gemini.planReplies.push({ text: planJson({ verses: VERSES_A }) });
  // minden szövegkísérlet (2 belső próba) megszakad
  for (let i = 0; i < 8; i++) gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });

  const summary = await run();
  assert.equal(summary.generated, 0);
  assert.equal(summary.approved, 0);
  assert.equal(summary.failures, 2);
  assert.equal(summary.outcome, "partial");
  assert.match(summary.events.join(" "), /két egymást követő hiba/);

  assert.equal(await getDevotionalByDate(TODAY), undefined, "hiányos szöveg nem kerül a tárolóba");
  assert.equal((await getPublicWindowDevotionals()).length, 0);
  const plan = (await getWeeklyPlanStore().getPlan(THIS_WEEK))!;
  const day = plan.days.find((d) => d.date === TODAY)!;
  assert.equal(day.autoAttempts, 1);
  assert.equal(day.autoAttemptsDate, TODAY);
  assert.equal(day.state, "failed");
});

test("napi kísérletkorlát: a kimerült nap aznap már nem kap újabb próbát, a rendszer a többit pótolja", async () => {
  await setAutopilotEnabled(true);
  gemini.planReplies.push({ text: planJson({ verses: VERSES_A }) });
  for (let i = 0; i < 40; i++) gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });

  for (let i = 0; i < MAX_DAILY_ATTEMPTS; i++) await run();
  const plan = (await getWeeklyPlanStore().getPlan(THIS_WEEK))!;
  assert.equal(plan.days.find((d) => d.date === TODAY)!.autoAttempts, MAX_DAILY_ATTEMPTS);
  assert.equal((await states())[0], "exhausted");

  const before = gemini.bodyCalls().length;
  const next = await run();
  const after = (await getWeeklyPlanStore().getPlan(THIS_WEEK))!;
  assert.equal(after.days.find((d) => d.date === TODAY)!.autoAttempts, MAX_DAILY_ATTEMPTS, "nem nőtt tovább");
  assert.ok(gemini.bodyCalls().length - before <= 4, "legfeljebb a többi nap próbálkozik");
  assert.match(next.events.join(" "), /kimerült/);

  // Sikeres válasz mellett a következő napon újra próbálkozik (a számláló naponként nullázódik).
  const tomorrow = addDaysToIsoDate(TODAY, 1);
  gemini.reset();
  for (let i = 0; i < 8; i++) gemini.bodyReplies.push({ text: FULL_BODY });
  const resumed = await run({ today: tomorrow });
  assert.ok(resumed.generated >= 1, "másnap újra próbálkozik");
});

test("a kézi (nem autopilot) heti terv és vázlat érintetlen; az autopilot nem generál és nem hagy jóvá helyette", async () => {
  await setAutopilotEnabled(true);
  const imported = await importPlan({ weekId: THIS_WEEK, text: planJson({ verses: VERSES_A }) });
  // kézi vázlat
  const draftRun = await run();
  assert.equal(gemini.calls.length, 0, "kézi vázlat mellett nincs Gemini-hívás");
  assert.equal((await getWeeklyPlanStore().getPlan(THIS_WEEK))?.source, "brief");
  assert.match(draftRun.events.join(" "), /kézi/i);

  // kézi, jóváhagyott terv
  await approvePlan({ weekId: THIS_WEEK, expectedUpdatedAt: imported.plan.updatedAt });
  gemini.reset();
  const approvedRun = await run();
  assert.equal(gemini.calls.length, 0, "kézi jóváhagyott terv mellett sincs automatikus generálás");
  assert.equal(approvedRun.generated, 0);
  assert.equal(await getDevotionalByDate(TODAY), undefined);
});

test("meglévő áhítat védelme: a napi folyamatból származó (mai) rekord érintetlen, a tartalék többi napja pótlódik", async () => {
  await setAutopilotEnabled(true);
  const legacy = await appendDevotional({
    date: TODAY,
    title: "A Szív Kincsei",
    verse: "Máté 6:21 — ...",
    content: "### Elmélkedés\n\nRégi.",
    imageUrl: "",
    category: "Életvezetés",
    status: "published",
    createdAt: `${TODAY}T00:14:32.245Z`,
    updatedAt: `${TODAY}T00:14:32.245Z`,
  });
  queueHappyGemini();
  await run();
  await run();

  const after = await getDevotionalByDate(TODAY);
  assert.equal(after?.title, legacy.title);
  assert.equal(after?.weekId, undefined, "a régi áhítat nem lett heti rekord");
  assert.equal(after?.status, "published");
  assert.ok((await states()).slice(1).every((s) => s === "covered"), "a következő napok kész");
});

test("kézi / ellenőrzésre váró régi rekord nem módosul és nem generálódik felé", async () => {
  await setAutopilotEnabled(true);
  await appendDevotional({
    date: addDaysToIsoDate(TODAY, 1),
    title: "Kézi piszkozat",
    verse: "x",
    content: "Szöveg",
    imageUrl: "",
    status: "needs_review",
    createdAt: `${TODAY}T00:00:00.000Z`,
  });
  queueHappyGemini();
  await run();
  const record = await getDevotionalByDate(addDaysToIsoDate(TODAY, 1));
  assert.equal(record?.title, "Kézi piszkozat");
  assert.equal(record?.status, "needs_review");
  assert.equal(record?.weekId, undefined);
});

test("egyidejű futások: amíg az egyik dolgozik, a másik 'busy'; az elakadt zár felülírható", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();
  // Az első futás a tervezési hívásnál vár (a zárat tartja), közben indul a második.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  gemini.hooks.beforePlanReply = () => gate;
  const first = run();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const second = await run();
  assert.equal(second.outcome, "busy");
  assert.equal(gemini.bodyCalls().length, 0, "a második futás nem generált");
  release();
  const firstResult = await first;
  assert.equal(firstResult.generated, 2);
  gemini.hooks.beforePlanReply = null;
  assert.equal(gemini.bodyCalls().length, 2, "összesen egyetlen futás generált (max. 2 nap)");

  // elakadt zár
  const state = await readAutopilotState();
  blob.seed(
    AUTOPILOT_PATH,
    JSON.stringify({ ...state, runningSince: new Date(Date.now() - LOCK_STALE_MS - 1000).toISOString() })
  );
  const reclaimed = await run();
  assert.notEqual(reclaimed.outcome, "busy");
  // friss zár
  blob.seed(AUTOPILOT_PATH, JSON.stringify({ ...state, runningSince: new Date().toISOString() }));
  assert.equal((await run()).outcome, "busy");
});

test("futás közbeni kikapcsolás: a következő lépés már nem indul", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();
  gemini.hooks.beforePlanReply = async () => {
    await setAutopilotEnabled(false);
  };
  const summary = await run();
  assert.equal(gemini.bodyCalls().length, 0, "kikapcsolás után nincs szöveg-generálás");
  assert.match(summary.events.join(" "), /kikapcsolták/);
  assert.equal((await readAutopilotState()).enabled, false);
});

test("időkeret: túl kevés idő esetén a futás Gemini-hívás nélkül megáll", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();
  const summary = await run({ budgetMs: 1000 });
  assert.equal(summary.outcome, "stopped");
  assert.equal(gemini.calls.length, 0);
  assert.match(summary.events.join(" "), /időkeret/);
});

test("az autopilot terve: a 90 napon belüli igeismétlést naplózottan elfogadja, a terven belülit nem (új tervet kér)", async () => {
  await setAutopilotEnabled(true);
  // nyilvántartott igehely a hét egyik napjára
  const store = getWeeklyPlanStore();
  await store.recordInRegistry([
    { date: addDaysToIsoDate(TODAY, -20), reference: "Joel 2:13", title: "Régebbi", weekId: "x" },
  ]);
  gemini.planReplies.push({ text: planJson({ verses: VERSES_A }) });
  gemini.planReplies.push({ text: planJson({ verses: VERSES_A }) }); // a javító kör sem tud cserélni
  for (let i = 0; i < 4; i++) gemini.bodyReplies.push({ text: FULL_BODY });
  const accepted = await run();
  assert.match(accepted.events.join(" "), /90 napon belüli igeismétlés elfogadva/);
  assert.equal((await store.getPlan(THIS_WEEK))?.status, "approved");
});

test("terven belüli igeismétlés: a vázlatot elveti, a következő futás új tervet készít", async () => {
  await setAutopilotEnabled(true);
  const dup = [...VERSES_A];
  dup[2] = dup[0];
  gemini.planReplies.push({ text: planJson({ verses: dup }) }); // első javaslat
  gemini.planReplies.push({ text: planJson({ verses: dup }) }); // a javítás sem sikerül
  const first = await run();
  assert.ok(first.failures >= 1);
  assert.equal(await getWeeklyPlanStore().getPlan(THIS_WEEK), null, "a hibás vázlat nem marad");

  gemini.reset();
  queueHappyGemini(4);
  const second = await run();
  assert.equal((await getWeeklyPlanStore().getPlan(THIS_WEEK))?.status, "approved");
  assert.ok(second.generated >= 1);
});

test("megszakadt korábbi futás: a kész, de jóvá nem hagyott autopilot-szöveget Gemini nélkül hagyja jóvá", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini(2);
  await run({ maxDayGenerations: 1 });
  // a mai jóváhagyás elmarad, mintha a futás a generálás és a jóváhagyás között állt volna le
  await updateDevotionalStatus(TODAY, "needs_review", { weeklyFlow: true });
  assert.equal((await states())[0], "pending-approval");

  gemini.reset();
  const summary = await run({ maxDayGenerations: 0 });
  assert.ok(summary.approved >= 1);
  assert.equal(gemini.calls.length, 0);
  assert.equal((await getDevotionalByDate(TODAY))?.status, "approved");
});

// ── a régi napi folyamat és a cron ──────────────────────────────────────────

test("a napi cron bekapcsolt autopilotnál az autopilotot futtatja, a régi napi generálás nem fut", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();
  const result = await runDailyCronGeneration({ force: true });
  assert.equal(result.outcome, "skipped");
  assert.match(result.message, /^Autopilot \(/);
  assert.equal((await getDevotionalByDate(TODAY))?.status, "approved");
  assert.ok(gemini.bodyCalls().every((c) => /HETI SOROZAT/.test(c.user)), "csak heti szövegek készültek, napi metaadat-hívás nem");
});

test("kikapcsolt autopilotnál a régi napi folyamat változatlanul fut", async () => {
  gemini.bodyReplies.push({
    text: JSON.stringify({
      title: "Napi folyamat",
      scripture: "Ézsaiás 40:31 — akik az Úrban bíznak, erőt kapnak",
      category: "Erő",
      excerpt: "Erő.",
      imageKeywords: "eagle, sky",
    }),
  });
  gemini.bodyReplies.push({ text: FULL_BODY });
  const result = await runDailyCronGeneration({ force: true });
  assert.equal(result.outcome, "created");
  assert.equal((await getDevotionalByDate(TODAY))?.weekId, undefined);
});

test("bekapcsolt autopilot mellett a régi óránkénti újrapróba nem fut", async () => {
  await setAutopilotEnabled(true);
  const result = await processDueGenerationRetries(new Date());
  assert.ok("processed" in result && result.processed === false);
  assert.match((result as { reason: string }).reason, /autopilot/i);
});

// ── API ─────────────────────────────────────────────────────────────────────

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

test("admin API: állapot, kapcsoló, futtatás — hitelesítéssel és bemenet-ellenőrzéssel", async () => {
  const route = await import("../src/app/api/admin/autopilot/route");

  setAdminAuthForTesting(async () => false);
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(post("/api/admin/autopilot", { action: "run" }))).status, 401);
  assert.equal(gemini.calls.length, 0);
  setAdminAuthForTesting(async () => true);

  const initial = await (await route.GET()).json();
  assert.equal(initial.enabled, false);
  assert.equal(initial.reserveTarget, 3);
  assert.equal(initial.coverage.length, 4);

  assert.equal((await route.POST(post("/api/admin/autopilot", { action: "set_enabled" }))).status, 400);
  assert.equal((await route.POST(post("/api/admin/autopilot", { action: "set_enabled", enabled: "igen" }))).status, 400);
  assert.equal((await route.POST(post("/api/admin/autopilot", { action: "x" }))).status, 400);

  const on = await route.POST(post("/api/admin/autopilot", { action: "set_enabled", enabled: true }));
  assert.equal((await on.json()).enabled, true);

  queueHappyGemini();
  const ran = await route.POST(post("/api/admin/autopilot", { action: "run" }));
  const body = await ran.json();
  assert.equal(body.summary.generated, 2);
  assert.equal(body.coverage[0].state, "covered");
});

test("cron útvonal: hitelesítés nélkül 401; adminként lefut; kikapcsolva nem csinál semmit", async () => {
  const route = await import("../src/app/api/cron/autopilot/route");
  setAdminAuthForTesting(async () => false);
  const denied = await route.GET(new NextRequest("http://localhost/api/cron/autopilot"));
  assert.equal(denied.status, 401);

  setAdminAuthForTesting(async () => true);
  const res = await route.GET(new NextRequest("http://localhost/api/cron/autopilot"));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).outcome, "disabled");
  assert.equal(gemini.calls.length, 0);
});

// ── a szerkesztő és az autopilot együttműködése ─────────────────────────────

test("a szerkesztő által visszanyitott autopilot-terv kézi lesz: az autopilot nem hagyja jóvá és nem generál rá", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();
  await run();
  const store = getWeeklyPlanStore();
  const live = (await store.getPlan(THIS_WEEK))!;
  assert.equal(live.source, "auto");

  const reopened = await reopenPlan({ weekId: THIS_WEEK, expectedUpdatedAt: live.updatedAt });
  assert.equal(reopened.plan.status, "draft");
  assert.equal(reopened.plan.source, "manual", "a szerkesztő átvette a tervet");

  gemini.reset();
  const after = await run();
  assert.equal(gemini.calls.length, 0, "kézi vázlat mellett nincs automatikus munka");
  assert.equal((await store.getPlan(THIS_WEEK))?.status, "draft", "a vázlatot nem hagyta jóvá");
  assert.match(after.events.join(" "), /kézi/i);
});

test("visszavont nap kézbentartott: az autopilot nem hagyja jóvá újra; a szerkesztő jóváhagyása feloldja", async () => {
  await setAutopilotEnabled(true);
  queueHappyGemini();
  await run();
  await run(); // a teljes tartalék kész
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: false, dates: [TODAY] });
  const hold = (await getWeeklyPlanStore().getPlan(THIS_WEEK))!.days.find((d) => d.date === TODAY)!;
  assert.equal(hold.manualHold, true);
  assert.equal((await states())[0], "manual-record");

  gemini.reset();
  const idle = await run();
  assert.equal((await getDevotionalByDate(TODAY))?.status, "needs_review", "az autopilot nem hagyta jóvá");
  assert.equal(idle.approved, 0);
  assert.equal(gemini.calls.length, 0);

  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  assert.equal((await getDevotionalByDate(TODAY))?.status, "approved");
  assert.equal((await getWeeklyPlanStore().getPlan(THIS_WEEK))!.days.find((d) => d.date === TODAY)!.manualHold, undefined);
});

test("a szerkesztő kézi generálása kézbentartott: az autopilot nem hagyja jóvá helyette", async () => {
  await setAutopilotEnabled(true);
  gemini.planReplies.push({ text: planJson({ verses: VERSES_A }) });
  // autopilot-terv (jóváhagyva), a szöveget a szerkesztő generálja kézzel
  const proposed = await proposePlan({ weekId: THIS_WEEK, auto: true });
  await approvePlan({ weekId: THIS_WEEK, expectedUpdatedAt: proposed.plan.updatedAt });
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: THIS_WEEK, date: TODAY });

  const day = (await getWeeklyPlanStore().getPlan(THIS_WEEK))!.days.find((d) => d.date === TODAY)!;
  assert.equal(day.manualHold, true);
  gemini.reset();
  const idle = await run({ maxDayGenerations: 0 });
  assert.equal((await getDevotionalByDate(TODAY))?.status, "needs_review");
  assert.equal(idle.approved, 0);
});

test("jóváhagyott kézi terv visszaadható az autopilotnak: a hiányzó napokat ő pótolja", async () => {
  await setAutopilotEnabled(true);
  const imported = await importPlan({ weekId: THIS_WEEK, text: planJson({ verses: VERSES_A }) });
  const approved = await approvePlan({ weekId: THIS_WEEK, expectedUpdatedAt: imported.plan.updatedAt });

  gemini.reset();
  assert.equal((await run()).generated, 0, "kézi terv: nincs automatikus generálás");

  await handToAutopilot({ weekId: THIS_WEEK, expectedUpdatedAt: (await getWeeklyPlanStore().getPlan(THIS_WEEK))!.updatedAt });
  assert.equal((await getWeeklyPlanStore().getPlan(THIS_WEEK))?.source, "auto");
  for (let i = 0; i < 4; i++) gemini.bodyReplies.push({ text: FULL_BODY });
  const resumed = await run();
  assert.equal(resumed.generated, 2);
  assert.equal((await getDevotionalByDate(TODAY))?.status, "approved");
  void approved;
});
