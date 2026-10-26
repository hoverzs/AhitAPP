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
import { buildAdminDevotionalContext } from "../src/lib/app-data";
import { runDailyCronGeneration } from "../src/lib/cron-generate-devotional";
import { TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE } from "../src/lib/devotional-text-complete";
import {
  appendDevotional,
  getDevotionalByDate,
  upsertDevotional,
} from "../src/lib/devotionals";
import { generateNextDevotional } from "../src/lib/generate-devotional";
import { createEmptyGenerationJob } from "../src/lib/generation-job-types";
import { processDueGenerationRetries } from "../src/lib/generation-job-runner";
import { getGenerationJob, saveGenerationJob } from "../src/lib/generation-job-storage";
import { applyDevotionalRefinement } from "../src/lib/refine-devotional";
import { setBlobClientForTesting, setImageStoreForTesting } from "../src/lib/storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { MemoryImageStore } from "../src/lib/storage/blob/image-store";
import type { Devotional } from "../src/lib/types";
import { generateWeekDay, setWeekDevotionalApproval } from "../src/lib/weekly-plan/day-generation";
import {
  ManagedByWeeklyPlanError,
  WeeklyPlanLockedError,
  WeeklyRecordProtectedError,
} from "../src/lib/weekly-plan/errors";
import { approvePlan, importPlan, reopenPlan } from "../src/lib/weekly-plan/service";
import { getWeeklyPlanStore } from "../src/lib/weekly-plan/store";
import { getWeekStart } from "../src/lib/weekly-plan/types";
import { FULL_BODY, installGeminiStub, planJson } from "./helpers/gemini-stub";

const TODAY = getAppTodayIso();
const THIS_WEEK = getWeekStart(TODAY);
const YESTERDAY = addDaysToIsoDate(TODAY, -1);
const gemini = installGeminiStub();

const DAILY_METADATA = JSON.stringify({
  title: "Napi folyamat áhítata",
  scripture: "Ézsaiás 40:31 — akik az Úrban bíznak, erőt kapnak",
  category: "Erő",
  excerpt: "Erő.",
  imageKeywords: "eagle, sky",
});

beforeEach(() => {
  setBlobClientForTesting(new MemoryBlobClient());
  setImageStoreForTesting(new MemoryImageStore());
  setAdminAuthForTesting(async () => true);
  gemini.reset();
});
afterEach(() => {
  setAdminAuthForTesting(null);
  setImageStoreForTesting(null);
  gemini.reset();
});

async function approvedPlan() {
  const imported = await importPlan({ weekId: THIS_WEEK, text: planJson({ verses: [
    "Zsoltárok 91:1", "Máté 11:28", "Filippi 4:13", "Ézsaiás 43:1", "Róma 12:12", "János 15:5", "Zsoltárok 121:1",
  ] }) });
  return (await approvePlan({ weekId: THIS_WEEK, expectedUpdatedAt: imported.plan.updatedAt })).plan;
}

async function weeklyRecord(date = TODAY): Promise<Devotional> {
  gemini.bodyReplies.push({ text: FULL_BODY });
  return (await generateWeekDay({ weekId: THIS_WEEK, date })).devotional;
}

function patch(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/devotional", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function patchRoute(body: Record<string, unknown>) {
  const { PATCH } = await import("../src/app/api/admin/devotional/route");
  return PATCH(patch(body));
}

function snapshot(d: Devotional | undefined) {
  return JSON.stringify({
    status: d?.status,
    weekId: d?.weekId,
    title: d?.title,
    content: d?.content,
    imageUrl: d?.imageUrl,
    imageKeywords: d?.imageKeywords,
    facebookCopy: d?.facebookCopy,
  });
}

// ── 1. a napi cron és a jóváhagyott heti terv ───────────────────────────────

test("cron: jóváhagyott heti terv által kezelt napra nem generál; az okot naplózza, tartalmi hiányt jelez", async () => {
  await approvedPlan();
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const result = await runDailyCronGeneration({ force: true });
    assert.equal(result.outcome, "skipped");
    assert.match(result.message, /heti terv kezeli/);
    assert.match(result.message, /FIGYELEM/, "a hiányzó tartalmat jelzi");
  } finally {
    console.warn = original;
  }
  assert.equal(gemini.calls.length, 0, "nincs Gemini-hívás");
  assert.equal(await getDevotionalByDate(TODAY), undefined, "nem keletkezett napi áhítat");
  assert.equal(await getGenerationJob(TODAY), null, "nem maradt függő napi feladat");
  assert.ok(warnings.some((w) => /TARTALMI HIÁNY|FIGYELEM/.test(w)), "hangos napló");
});

test("cron: ha a kezelt napnak van jóváhagyott heti áhítata, nincs hiány-jelzés", async () => {
  await approvedPlan();
  await weeklyRecord();
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  gemini.reset();

  const result = await runDailyCronGeneration({ force: true });
  assert.equal(result.outcome, "skipped");
  assert.match(result.message, /heti terv kezeli/);
  assert.equal(/FIGYELEM/.test(result.message), false);
  assert.equal(gemini.calls.length, 0);
});

test("cron: jóváhagyatlan (vázlat) terv nem köti a napi folyamatot — az továbbra is generál", async () => {
  const imported = await importPlan({ weekId: THIS_WEEK, text: planJson() });
  assert.equal(imported.plan.status, "draft");
  gemini.bodyReplies.push({ text: DAILY_METADATA }, { text: FULL_BODY });

  const result = await runDailyCronGeneration({ force: true });
  assert.equal(result.outcome, "created");
  const record = await getDevotionalByDate(TODAY);
  assert.equal(record?.weekId, undefined, "a napi áhítatnak nincs heti azonosítója");
  assert.equal(record?.status, "published");
});

test("cron: a nap közben heti tervhez került — a függő óránkénti újrapróba lezárul, nem generál", async () => {
  await saveGenerationJob({
    ...createEmptyGenerationJob(TODAY),
    status: "pending_retry",
    retry_count: 1,
    first_failed_at: "2026-01-01T00:00:00.000Z",
    next_retry_at: "2000-01-01T00:00:00.000Z",
  });
  await approvedPlan();

  const result = await processDueGenerationRetries(new Date());
  assert.ok("skipReason" in result && result.skipReason);
  assert.equal(await getGenerationJob(TODAY), null, "a függő feladat lezárva");
  assert.equal(gemini.calls.length, 0);
});

test("manuális napi generálás (belső függvény és /api/generate) kezelt napra 409", async () => {
  await approvedPlan();
  await assert.rejects(generateNextDevotional(), ManagedByWeeklyPlanError);

  const { POST } = await import("../src/app/api/generate/route");
  const res = await POST();
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "MANAGED_BY_WEEKLY_PLAN");
  assert.equal(gemini.calls.length, 0);
});

test("nincs versengő folyamat: a heti generálás és a cron egyszerre — pontosan egy (heti) rekord", async () => {
  await approvedPlan();
  gemini.bodyReplies.push({ text: FULL_BODY });
  const [weekly, cron] = await Promise.all([
    generateWeekDay({ weekId: THIS_WEEK, date: TODAY }),
    runDailyCronGeneration({ force: true }),
  ]);
  assert.equal(weekly.devotional.weekId, THIS_WEEK);
  assert.equal(cron.outcome, "skipped");
  assert.equal((await getDevotionalByDate(TODAY))?.weekId, THIS_WEEK);
  assert.equal(gemini.bodyCalls().length, 1);
});

test("a napi folyamatból származó áhítat a heti tervben: a heti generálás nem írja felül (409)", async () => {
  const legacy: Devotional = {
    date: TODAY,
    title: "Napi áhítat",
    verse: "Ján 3:16 — ...",
    content: "Szöveg",
    imageUrl: "",
    createdAt: `${TODAY}T00:00:00.000Z`,
    status: "published",
  };
  await appendDevotional(legacy);
  await approvedPlan();
  await assert.rejects(generateWeekDay({ weekId: THIS_WEEK, date: TODAY }));
  assert.equal((await getDevotionalByDate(TODAY))?.title, "Napi áhítat");
});

// ── 2. a régi admin API nem kerülheti meg a heti szabályokat ────────────────

test("régi PATCH: heti áhítat státusza csak a heti műhelyből változhat (approve, publish, revert_draft, save_draft tiltott)", async () => {
  await approvedPlan();
  await weeklyRecord();
  const before = snapshot(await getDevotionalByDate(TODAY));

  for (const action of ["approve", "publish", "revert_draft", "save_draft"]) {
    const res = await patchRoute({
      date: TODAY,
      action,
      fields: { title: "Átírt cím" },
    });
    assert.equal(res.status, 409, action);
    const body = await res.json();
    assert.equal(body.code, "WEEKLY_PROTECTED", action);
  }
  assert.equal(snapshot(await getDevotionalByDate(TODAY)), before, "semmi nem változott");
});

test("régi PATCH: az ellenőrzésre váró heti áhítat szerkeszthető (save), de a státusza és a heti azonosítója marad", async () => {
  await approvedPlan();
  await weeklyRecord();
  const res = await patchRoute({ date: TODAY, action: "save", fields: { title: "Szerkesztett cím" } });
  assert.equal(res.status, 200);
  const saved = await getDevotionalByDate(TODAY);
  assert.equal(saved?.title, "Szerkesztett cím");
  assert.equal(saved?.status, "needs_review");
  assert.equal(saved?.weekId, THIS_WEEK);
});

test("régi PATCH: jóváhagyott heti áhítat minden módosítása tiltott (szöveg, kulcsszó, kép, kép törlése)", async () => {
  await approvedPlan();
  await weeklyRecord();
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  const before = snapshot(await getDevotionalByDate(TODAY));

  const attempts: Record<string, unknown>[] = [
    { action: "save", fields: { title: "Átírt" } },
    { action: "save_draft", fields: { title: "Átírt" } },
    { action: "approve" },
    { action: "publish" },
    { action: "revert_draft" },
    { action: "save_image_keywords", imageKeywords: "mas, kulcs" },
    {
      action: "select_pexels_image",
      image: {
        imageUrl: "https://images.pexels.com/photos/1/x.jpeg",
        imageCredit: "Fotós",
        imagePhotographerUrl: "https://www.pexels.com/@f",
      },
    },
    { action: "remove_image" },
  ];
  for (const attempt of attempts) {
    const res = await patchRoute({ date: TODAY, ...attempt });
    assert.equal(res.status, 409, String(attempt.action));
    assert.equal((await res.json()).code, "WEEKLY_PROTECTED", String(attempt.action));
  }
  assert.equal(snapshot(await getDevotionalByDate(TODAY)), before, "az áhítat érintetlen");
});

test("a heti műhely jóváhagyás-visszavonása után a régi szerkesztés újra engedett", async () => {
  await approvedPlan();
  await weeklyRecord();
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  assert.equal((await patchRoute({ date: TODAY, action: "save", fields: { title: "X" } })).status, 409);

  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: false, dates: [TODAY] });
  assert.equal((await patchRoute({ date: TODAY, action: "save", fields: { title: "Y" } })).status, 200);
});

test("a régi napi folyamat áhítatai (heti azonosító nélkül) továbbra is a régi szabályok szerint kezelhetők", async () => {
  await appendDevotional({
    date: YESTERDAY,
    title: "Régi",
    verse: "Ján 3:16 — ...",
    content: "Szöveg",
    imageUrl: "",
    createdAt: `${YESTERDAY}T00:00:00.000Z`,
    status: "needs_review",
  });
  for (const action of ["approve", "publish", "revert_draft"]) {
    assert.equal((await patchRoute({ date: YESTERDAY, action })).status, 200, action);
  }
});

test("régi újragenerálás és finomítás: heti áhítatra tiltott státuszváltás / zárolt rekord módosítás", async () => {
  await approvedPlan();
  await weeklyRecord();

  // újragenerálás a régi útvonalon
  const { POST } = await import("../src/app/api/admin/devotional/regenerate/route");
  const regen = await POST(
    new Request("http://localhost/api/admin/devotional/regenerate", {
      method: "POST",
      body: JSON.stringify({ date: TODAY }),
    })
  );
  assert.equal(regen.status, 409);
  assert.equal((await regen.json()).reason, "regenerate");
  assert.equal(gemini.bodyCalls().length, 1, "csak a heti generálás hívta a Geminit");

  const refined = {
    title: "Finomított",
    verse: "Zsoltárok 91:1 — ige",
    category: "Hit",
    content: "### Elmélkedés\n\nFinomított szöveg.\n\n### Mai imádság\n\nÁmen.\n\n### Gondolatébresztő kérdés\n\nMit változtatsz?",
    facebookCopy: "Ajánló",
  };
  // közzétételre állítás a finomítón át tiltott
  await assert.rejects(
    applyDevotionalRefinement(TODAY, refined, { instruction: "x", statusAfter: "published" }),
    WeeklyRecordProtectedError
  );
  // státuszváltás nélküli finomítás az ellenőrzésre váró áhítaton engedett
  const ok = await applyDevotionalRefinement(TODAY, refined, { instruction: "x", statusAfter: "needs_review" });
  assert.equal(ok.status, "needs_review");
  assert.equal(ok.weekId, THIS_WEEK);

  // jóváhagyott áhítaton minden finomítás tiltott
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  await assert.rejects(
    applyDevotionalRefinement(TODAY, refined, { instruction: "y", statusAfter: "keep" }),
    WeeklyRecordProtectedError
  );
});

test("a heti azonosító nélküli objektummal sem írható felül a heti rekord (upsert)", async () => {
  await approvedPlan();
  const record = await weeklyRecord();
  const { weekId: _weekId, ...withoutWeek } = record;
  void _weekId;
  await assert.rejects(
    upsertDevotional({ ...withoutWeek, title: "Heti azonosító nélkül" } as Devotional),
    WeeklyRecordProtectedError
  );
  await assert.rejects(
    upsertDevotional({ ...record, status: "published" }),
    WeeklyRecordProtectedError
  );
  assert.equal((await getDevotionalByDate(TODAY))?.weekId, THIS_WEEK);
});

test("képfeltöltés zárolt heti áhítatra: 409, és semmi nem kerül a képtárba", async () => {
  await approvedPlan();
  await weeklyRecord();
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  const images = new MemoryImageStore();
  setImageStoreForTesting(images);

  const { POST } = await import("../src/app/api/admin/devotional/upload-image/route");
  const form = new FormData();
  form.set("date", TODAY);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  form.set("file", new File([jpeg], "kep.jpg", { type: "image/jpeg" }));
  const res = await POST(new NextRequest("http://localhost/api/admin/devotional/upload-image", { method: "POST", body: form }));
  assert.equal(res.status, 409);
  assert.equal(images.size(), 0, "nem maradt árva kép");
});

test("heti generálás jóváhagyott áhítatra: előbb vissza kell vonni a jóváhagyást", async () => {
  await approvedPlan();
  await weeklyRecord();
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  await assert.rejects(
    generateWeekDay({ weekId: THIS_WEEK, date: TODAY, force: true }),
    WeeklyPlanLockedError
  );
  assert.equal(gemini.bodyCalls().length, 1);
});

test("visszanyitott terv mellett sem generálhat a napi folyamat a heti rekord helyére", async () => {
  const plan = await approvedPlan();
  await weeklyRecord();
  const live = (await getWeeklyPlanStore().getPlan(THIS_WEEK))!;
  await reopenPlan({ weekId: THIS_WEEK, expectedUpdatedAt: live.updatedAt });
  void plan;
  const before = snapshot(await getDevotionalByDate(TODAY));

  const { POST } = await import("../src/app/api/generate/route");
  const res = await POST();
  assert.equal(res.status, 409);
  assert.equal(snapshot(await getDevotionalByDate(TODAY)), before, "a heti rekord érintetlen");
});

test("a régi /api/generate hibaága nem ír hibaüzenetet a heti rekordba", async () => {
  // vázlat terv: nem kezeli a napot, de a heti rekord létezik és ellenőrzésre vár
  await approvedPlan();
  await weeklyRecord();
  const live = (await getWeeklyPlanStore().getPlan(THIS_WEEK))!;
  await reopenPlan({ weekId: THIS_WEEK, expectedUpdatedAt: live.updatedAt });
  gemini.bodyReplies.push({ httpStatus: 500 });

  const { POST } = await import("../src/app/api/generate/route");
  await POST();
  assert.equal((await getDevotionalByDate(TODAY))?.lastApiError, undefined);
});

// ── 3. figyelmeztetések: dátum és áhítat egyértelmű ─────────────────────────

function pending(date: string, title: string, lastApiError?: string): Devotional {
  return {
    date,
    title,
    verse: "x",
    content: "Szöveg",
    imageUrl: "",
    createdAt: `${date}T00:00:00.000Z`,
    status: "needs_review",
    lastApiError,
  };
}

test("figyelmeztetés: a tegnapi hibás rekord dátummal és címmel jelenik meg, és nem a mai hibájaként", async () => {
  const context = await buildAdminDevotionalContext([
    pending(YESTERDAY, "Az Igaz Út", TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE),
    { ...pending(TODAY, "A Szív Kincsei"), status: "published" },
  ]);

  assert.equal(context.reviewWarnings?.length, 1);
  const [warning] = context.reviewWarnings!;
  assert.equal(warning.date, YESTERDAY);
  assert.equal(warning.title, "Az Igaz Út");
  assert.equal(warning.isToday, false);
  assert.match(context.reviewWarning!, new RegExp(`${YESTERDAY}.*Az Igaz Út`));
  assert.equal(context.reviewWarning!.includes("A Szív Kincsei"), false);
});

test("figyelmeztetés: minden hibás rekord külön sor, a maira isToday igaz", async () => {
  const context = await buildAdminDevotionalContext([
    pending(YESTERDAY, "Tegnapi", TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE),
    pending(TODAY, "Mai", TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE),
  ]);
  assert.deepEqual(
    context.reviewWarnings!.map((w) => [w.date, w.isToday]),
    [
      [TODAY, true],
      [YESTERDAY, false],
    ]
  );
});

test("admin kontextus: a jóváhagyott heti terv által kezelt mai nap jelezve, a hiánnyal együtt", async () => {
  await approvedPlan();
  const gap = await buildAdminDevotionalContext([]);
  assert.deepEqual(gap.weeklyPlanNotice, { weekId: THIS_WEEK, contentGap: true });

  await weeklyRecord();
  await setWeekDevotionalApproval({ weekId: THIS_WEEK, approve: true, dates: [TODAY] });
  const record = await getDevotionalByDate(TODAY);
  const covered = await buildAdminDevotionalContext([record!]);
  assert.deepEqual(covered.weeklyPlanNotice, { weekId: THIS_WEEK, contentGap: false });
});
