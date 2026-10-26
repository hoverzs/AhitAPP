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
import { runDailyCronGeneration } from "../src/lib/cron-generate-devotional";
import {
  appendDevotional,
  getDevotionalByDate,
  getPublicWindowDevotionals,
} from "../src/lib/devotionals";
import { setBlobClientForTesting, setImageStoreForTesting } from "../src/lib/storage";
import { MemoryImageStore } from "../src/lib/storage/blob/image-store";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import type { Devotional } from "../src/lib/types";
import { readDevotionalBackup } from "../src/lib/weekly-plan/backups";
import { generateWeekDay, setWeekDevotionalApproval } from "../src/lib/weekly-plan/day-generation";
import {
  DayAlreadyReadyError,
  DayBusyError,
  DayConflictError,
  DayIncompleteError,
  ReplacementStaleError,
  WeeklyPlanInputError,
  WeeklyPlanLockedError,
} from "../src/lib/weekly-plan/errors";
import { prepareReplacement, restoreReplaced } from "../src/lib/weekly-plan/replacement";
import { approvePlan, importPlan } from "../src/lib/weekly-plan/service";
import { getWeeklyPlanStore } from "../src/lib/weekly-plan/store";
import { getWeekStart } from "../src/lib/weekly-plan/types";
import { FULL_BODY, TRUNCATED_BODY, installGeminiStub, planJson } from "./helpers/gemini-stub";

const TODAY = getAppTodayIso();
const THIS_WEEK = getWeekStart(TODAY);
const gemini = installGeminiStub();

let blob: MemoryBlobClient;
let images: MemoryImageStore;

beforeEach(() => {
  blob = new MemoryBlobClient();
  images = new MemoryImageStore();
  setBlobClientForTesting(blob);
  setImageStoreForTesting(images);
  setAdminAuthForTesting(async () => true);
  gemini.reset();
});
afterEach(() => {
  setAdminAuthForTesting(null);
  setImageStoreForTesting(null);
  gemini.reset();
});

const OLD_IMAGE = "https://own.public.blob.vercel-storage.com/images/old/devotional.jpg";

async function legacyToday(): Promise<Devotional> {
  return appendDevotional({
    date: TODAY,
    title: "A Szív Kincsei",
    verse: "Máté 6:21 — Mert ahol a te kincsed van, ott lesz a te szíved is.",
    content: "### Elmélkedés\n\nA régi, napi folyamatból származó szöveg.\n\n### Mai imádság\n\nRégi ima. Ámen.",
    prayer: "Régi ima. Ámen.",
    imageUrl: OLD_IMAGE,
    imageSource: "manual",
    category: "Életvezetés",
    facebookCopy: "Régi ajánló",
    status: "published",
    createdAt: `${TODAY}T00:14:32.245Z`,
    generatedAt: `${TODAY}T00:14:32.245Z`,
    updatedAt: `${TODAY}T00:14:32.245Z`,
  });
}

async function approvedPlan() {
  const imported = await importPlan({
    weekId: THIS_WEEK,
    text: planJson({
      titlePrefix: "Bűnbánat",
      verses: ["Zsoltárok 51:3", "1 János 1:9", "Lukács 15:18", "Joel 2:13", "Máté 3:2", "Jakab 4:8", "Róma 2:4"],
    }),
  });
  return (await approvePlan({ weekId: THIS_WEEK, expectedUpdatedAt: imported.plan.updatedAt })).plan;
}

const dayOf = async (date = TODAY) =>
  (await getWeeklyPlanStore().getPlan(THIS_WEEK))!.days.find((d) => d.date === date)!;

async function backupCount(): Promise<number> {
  return (await blob.list("backups/")).length;
}

test("közvetlen generálás a régi, élő áhítat helyére tiltott (409) és az áhítat érintetlen", async () => {
  await legacyToday();
  await approvedPlan();
  await assert.rejects(generateWeekDay({ weekId: THIS_WEEK, date: TODAY }), (error) => {
    assert.ok(error instanceof DayConflictError);
    assert.match(error.message, /Csere előkészítése/);
    return true;
  });
  assert.equal((await getDevotionalByDate(TODAY))?.title, "A Szív Kincsei");
  assert.equal(gemini.bodyCalls().length, 0);
});

test("előkészítés: teljes mentés készül, az élő áhítat nem változik és nem tűnik el", async () => {
  const legacy = await legacyToday();
  await approvedPlan();
  const result = await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });

  assert.equal(result.reused, false);
  assert.equal(await backupCount(), 1);
  const backup = await readDevotionalBackup(result.replacement.backupPath);
  assert.equal(backup?.record.title, "A Szív Kincsei");
  assert.equal(backup?.record.content, legacy.content);
  assert.equal(backup?.record.imageUrl, OLD_IMAGE);
  assert.match(result.replacement.backupPath, new RegExp(`^backups/${TODAY}/`));

  const live = await getDevotionalByDate(TODAY);
  assert.equal(live?.status, "published");
  assert.equal(live?.weekId, undefined);
  assert.equal((await getPublicWindowDevotionals()).length, 1, "a régi áhítat továbbra is nyilvános");
  assert.equal(gemini.calls.length, 0, "az előkészítés nem generál");
  assert.equal((await dayOf()).replacement?.previousTitle, "A Szív Kincsei");
});

test("előkészítés: ismételve nem készít új mentést, ha a rekord nem változott; változás után újat", async () => {
  await legacyToday();
  await approvedPlan();
  const first = await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  const second = await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  assert.equal(second.reused, true);
  assert.equal(second.replacement.backupId, first.replacement.backupId);
  assert.equal(await backupCount(), 1);

  // A régi rekord módosul → új, pontos mentés kell.
  const { getDevotionalStorage } = await import("../src/lib/storage");
  const live = (await getDevotionalByDate(TODAY))!;
  await getDevotionalStorage().updateDevotional(TODAY, { ...live, title: "Átírt cím", updatedAt: new Date().toISOString() });
  const third = await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  assert.equal(third.reused, false);
  assert.equal(await backupCount(), 2);
});

test("előkészítés: jóváhagyott terv, meglévő régi áhítat kell; heti áhítatot nem cserélünk", async () => {
  // nincs jóváhagyott terv
  const imported = await importPlan({ weekId: THIS_WEEK, text: planJson() });
  assert.equal(imported.plan.status, "draft");
  await legacyToday();
  await assert.rejects(prepareReplacement({ weekId: THIS_WEEK, date: TODAY }), WeeklyPlanLockedError);
  assert.equal(await backupCount(), 0);

  await approvePlan({ weekId: THIS_WEEK, expectedUpdatedAt: (await getWeeklyPlanStore().getPlan(THIS_WEEK))!.updatedAt });
  // nincs régi áhítat a holnapi napon
  await assert.rejects(
    prepareReplacement({ weekId: THIS_WEEK, date: addDaysToIsoDate(THIS_WEEK, 6) }),
    WeeklyPlanInputError
  );
  assert.equal(await backupCount(), 0);
});

test("végrehajtás: megerősítés, előkészítés és változatlan régi rekord nélkül nem fut, Gemini-hívás sincs", async () => {
  await legacyToday();
  await approvedPlan();

  await assert.rejects(generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true }), /Előbb készíts biztonsági mentést/);
  await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  await assert.rejects(generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true }), /megerősítés/);

  const { getDevotionalStorage } = await import("../src/lib/storage");
  const live = (await getDevotionalByDate(TODAY))!;
  await getDevotionalStorage().updateDevotional(TODAY, { ...live, updatedAt: new Date().toISOString() });
  await assert.rejects(
    generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true }),
    ReplacementStaleError
  );
  assert.equal(gemini.bodyCalls().length, 0);
});

test("sikertelen generálásnál a régi áhítat érintetlen és élő marad; a csere előkészített állapotban marad", async () => {
  const legacy = await legacyToday();
  await approvedPlan();
  await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });

  gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });
  gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });
  await assert.rejects(
    generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true }),
    DayIncompleteError
  );
  gemini.bodyReplies.push({ httpStatus: 500 });
  await assert.rejects(generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true }));

  const live = await getDevotionalByDate(TODAY);
  assert.equal(live?.title, legacy.title);
  assert.equal(live?.content, legacy.content);
  assert.equal(live?.status, "published");
  assert.equal(live?.weekId, undefined);
  assert.equal((await getPublicWindowDevotionals()).length, 1);

  const day = await dayOf();
  assert.equal(day.state, "failed");
  assert.ok(day.replacement && !day.replacement.executedAt, "újra megpróbálható");
});

test("sikeres csere: az új szöveg ellenőrzésre vár, a régi a verziótörténetben, a mentésben és a képtárban megmarad", async () => {
  const legacy = await legacyToday();
  await images.put("images/old/devotional.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
  await approvedPlan();
  const prepared = await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });

  gemini.bodyReplies.push({ text: FULL_BODY });
  const result = await generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true });

  const record = (await getDevotionalByDate(TODAY))!;
  assert.equal(record.weekId, THIS_WEEK);
  assert.equal(record.status, "needs_review");
  assert.match(record.title, /Bűnbánat 1/);
  assert.equal(result.regenerated, true);
  assert.equal(record.versionHistory?.length, 1);
  assert.equal(record.versionHistory?.[0].reason, "weekly_replacement");
  assert.equal(record.versionHistory?.[0].content, legacy.content);
  assert.equal(record.versionHistory?.[0].status, "published");
  assert.notEqual(record.imageUrl, OLD_IMAGE, "az új szöveghez új kép készül");

  assert.equal(images.size(), 1, "a régi (saját) kép nem törlődött");
  assert.equal((await readDevotionalBackup(prepared.replacement.backupPath))?.record.content, legacy.content);
  assert.equal((await dayOf()).replacement?.executedAt !== undefined, true);
  assert.equal((await getPublicWindowDevotionals()).length, 0, "az új szöveg jóváhagyásig nem nyilvános");

  // A napi cron nem versenyez: a nap a heti tervé.
  gemini.reset();
  const cron = await runDailyCronGeneration({ force: true });
  assert.equal(cron.outcome, "skipped");
  assert.equal(gemini.calls.length, 0);
});

test("a csere után a heti jóváhagyás a szokásos; végrehajtott cseréhez nem lehet újra előkészíteni", async () => {
  await legacyToday();
  await approvedPlan();
  await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true });

  const approved = await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  assert.deepEqual(approved.changed, [TODAY]);
  assert.equal((await getPublicWindowDevotionals())[0]?.weekId, THIS_WEEK);

  // Az áhítat már a heti sorozat része: új előkészítés nincs (csak visszaállítás).
  await assert.rejects(prepareReplacement({ weekId: THIS_WEEK, date: TODAY }), WeeklyPlanInputError);
});

test("visszaállítás: a régi áhítat (szöveg, kép, státusz) visszatér, az új a verziótörténetben marad", async () => {
  const legacy = await legacyToday();
  await approvedPlan();
  await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true });
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });

  await assert.rejects(restoreReplaced({ weekId: THIS_WEEK, date: TODAY }), /megerősítés/);
  const restored = await restoreReplaced({ weekId: THIS_WEEK, date: TODAY, confirm: true });
  assert.equal(restored.source, "backup");

  const record = (await getDevotionalByDate(TODAY))!;
  assert.equal(record.title, legacy.title);
  assert.equal(record.content, legacy.content);
  assert.equal(record.imageUrl, OLD_IMAGE);
  assert.equal(record.status, "published");
  assert.equal(record.weekId, undefined, "újra napi folyamatból származó rekord");
  assert.ok(record.versionHistory?.some((v) => /Bűnbánat/.test(v.title)), "az új szöveg megmaradt a történetben");

  const publicNow = await getPublicWindowDevotionals();
  assert.equal(publicNow.length, 1);
  assert.equal(publicNow[0].title, legacy.title);

  const day = await dayOf();
  assert.equal(day.state, "planned");
  assert.equal(day.replacement, undefined);
  // A nap újra kiváltható: új előkészítés, új mentés.
  const again = await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  assert.equal(again.reused, false);
});

test("visszaállítás a mentés nélkül is lehetséges a verziótörténetből", async () => {
  const legacy = await legacyToday();
  await approvedPlan();
  const prepared = await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  gemini.bodyReplies.push({ text: FULL_BODY });
  await generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true });

  await blob.del([prepared.replacement.backupPath]);
  const restored = await restoreReplaced({ weekId: THIS_WEEK, date: TODAY, confirm: true });
  assert.equal(restored.source, "version-history");
  assert.equal(restored.devotional.content, legacy.content);
  assert.equal(restored.devotional.weekId, undefined);
});

test("visszaállítás csak végrehajtott cserénél és csak heti rekordra", async () => {
  await legacyToday();
  await approvedPlan();
  await assert.rejects(restoreReplaced({ weekId: THIS_WEEK, date: TODAY, confirm: true }), /nincs végrehajtott csere/);
  await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  await assert.rejects(restoreReplaced({ weekId: THIS_WEEK, date: TODAY, confirm: true }), /nincs végrehajtott csere/);
});

test("párhuzamos csere-indítás: csak az egyik fut, egyetlen Gemini-hívás", async () => {
  await legacyToday();
  await approvedPlan();
  await prepareReplacement({ weekId: THIS_WEEK, date: TODAY });
  gemini.bodyReplies.push({ text: FULL_BODY });
  gemini.bodyReplies.push({ text: FULL_BODY });

  const results = await Promise.allSettled([
    generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true }),
    generateWeekDay({ weekId: THIS_WEEK, date: TODAY, replace: true, confirmReplace: true }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(
    rejected.reason instanceof DayBusyError ||
      rejected.reason instanceof DayAlreadyReadyError ||
      rejected.reason instanceof WeeklyPlanInputError,
    String(rejected.reason)
  );
  assert.equal(gemini.bodyCalls().length, 1);
});

// ── API ─────────────────────────────────────────────────────────────────────

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

test("API: előkészítés, megerősítés nélküli csere 400, megerősített csere 200, visszaállítás megerősítéssel", async () => {
  await legacyToday();
  await approvedPlan();
  const main = await import("../src/app/api/admin/weekly-plan/route");
  const day = await import("../src/app/api/admin/weekly-plan/day/route");

  const prep = await main.POST(post("/api/admin/weekly-plan", { action: "prepare_replacement", week: THIS_WEEK, date: TODAY }));
  assert.equal(prep.status, 200);
  assert.equal((await prep.json()).reused, false);

  const noConfirm = await day.POST(post("/api/admin/weekly-plan/day", { week: THIS_WEEK, date: TODAY, replace: true }));
  assert.equal(noConfirm.status, 400);

  gemini.bodyReplies.push({ text: FULL_BODY });
  const replaced = await day.POST(post("/api/admin/weekly-plan/day", { week: THIS_WEEK, date: TODAY, replace: true, confirm: true }));
  assert.equal(replaced.status, 200);

  const noRestoreConfirm = await main.POST(post("/api/admin/weekly-plan", { action: "restore_replaced", week: THIS_WEEK, date: TODAY }));
  assert.equal(noRestoreConfirm.status, 400);
  const restored = await main.POST(post("/api/admin/weekly-plan", { action: "restore_replaced", week: THIS_WEEK, date: TODAY, confirm: true }));
  assert.equal(restored.status, 200);
  assert.equal((await getDevotionalByDate(TODAY))?.title, "A Szív Kincsei");

  // hitelesítés nélkül
  setAdminAuthForTesting(async () => false);
  const denied = await main.POST(post("/api/admin/weekly-plan", { action: "prepare_replacement", week: THIS_WEEK, date: TODAY }));
  assert.equal(denied.status, 401);
});

// ── a napi folyamat előzménye a heti tervezőben ─────────────────────────────

test("a napi folyamat korábbi igehelye ütközésként jelenik meg a heti tervben; a kiváltott nap sajátja nem", async () => {
  const yesterday = addDaysToIsoDate(TODAY, -1);
  await appendDevotional({
    date: yesterday,
    title: "Az Igaz Út",
    verse: "Példabeszédek 4:18 — Az igazak ösvénye olyan, mint a felkelő nap fénye",
    content: "Szöveg",
    imageUrl: "",
    category: "Önreflexió",
    status: "needs_review",
    createdAt: `${yesterday}T13:00:00.000Z`,
  });
  await legacyToday();

  const imported = await importPlan({
    weekId: THIS_WEEK,
    text: planJson({
      verses: ["Máté 6:21", "Példabeszédek 4:18", "Lukács 15:18", "Joel 2:13", "Máté 3:2", "Jakab 4:8", "Róma 2:4"],
    }),
  });
  const errors = imported.issues.errors;
  assert.ok(errors.some((e) => e.includes("Példabeszédek 4:18") && e.includes("Az Igaz Út")), "a tegnapi napi igehely ütközik");
  assert.equal(errors.some((e) => e.includes("Máté 6:21")), false, "a kiváltandó mai nap saját igéje nem ütközik");
});
