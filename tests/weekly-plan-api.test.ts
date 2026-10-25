process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";
process.env.GEMINI_API_KEY = "test-key";
delete process.env.GOOGLE_API_KEY;
delete process.env.PEXELS_API_KEY;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import { addDaysToIsoDate, getAppTodayIso } from "../src/lib/app-date";
import { setAdminAuthForTesting } from "../src/lib/auth";
import { setBlobClientForTesting } from "../src/lib/storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { getNextWeekStart } from "../src/lib/weekly-plan/types";
import { FULL_BODY, TRUNCATED_BODY, installGeminiStub, planJson } from "./helpers/gemini-stub";

const TODAY = getAppTodayIso();
const NEXT_WEEK = getNextWeekStart(TODAY);
const gemini = installGeminiStub();

beforeEach(() => {
  setBlobClientForTesting(new MemoryBlobClient());
  setAdminAuthForTesting(async () => true);
  gemini.reset();
});
afterEach(() => {
  setAdminAuthForTesting(null);
  gemini.reset();
});

async function routes() {
  const main = await import("../src/app/api/admin/weekly-plan/route");
  const day = await import("../src/app/api/admin/weekly-plan/day/route");
  return { main, day };
}

function post(path: string, body: unknown, raw = false): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function get(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/admin/weekly-plan${query}`);
}

test("hitelesítés nélkül minden végpont 401, és semmi nem fut le", async () => {
  setAdminAuthForTesting(async () => false);
  const { main, day } = await routes();

  assert.equal((await main.GET(get())).status, 401);
  assert.equal(
    (await main.POST(post("/api/admin/weekly-plan", { action: "propose", week: NEXT_WEEK, theme: "x" }))).status,
    401
  );
  assert.equal(
    (await day.POST(post("/api/admin/weekly-plan/day", { week: NEXT_WEEK, date: NEXT_WEEK }))).status,
    401
  );
  assert.equal(gemini.calls.length, 0, "jogosulatlan kérésnél nincs Gemini-hívás");
  const { getWeeklyPlanStore } = await import("../src/lib/weekly-plan/store");
  assert.equal(await getWeeklyPlanStore().getPlan(NEXT_WEEK), null);
});

test("minden útvonal a hitelesítéssel kezd (forrásellenőrzés)", () => {
  for (const file of [
    "src/app/api/admin/weekly-plan/route.ts",
    "src/app/api/admin/weekly-plan/day/route.ts",
  ]) {
    const source = readFileSync(file, "utf-8");
    for (const handler of source.match(/export async function (GET|POST)/g) ?? []) {
      const body = source.slice(source.indexOf(handler));
      assert.ok(
        /await requireAdmin\(\)/.test(body.slice(0, 200)),
        `${file}: ${handler} nem a hitelesítéssel kezd`
      );
    }
  }
});

test("bemenet-ellenőrzés: érvénytelen JSON, típus, művelet, hét, méret → 400", async () => {
  const { main, day } = await routes();
  const bad = async (req: NextRequest, handler: (r: NextRequest) => Promise<Response>) => {
    const res = await handler(req);
    assert.equal(res.status, 400, JSON.stringify(await res.clone().json()));
    return (await res.json()) as { code: string };
  };

  await bad(post("/api/admin/weekly-plan", "{nem json", true), main.POST);
  await bad(post("/api/admin/weekly-plan", [1, 2], false), main.POST);
  await bad(post("/api/admin/weekly-plan", { week: NEXT_WEEK }), main.POST); // action nélkül
  await bad(post("/api/admin/weekly-plan", { action: "torol-mindent", week: NEXT_WEEK }), main.POST);
  await bad(post("/api/admin/weekly-plan", { action: "propose", week: addDaysToIsoDate(NEXT_WEEK, 1), theme: "x" }), main.POST); // nem hétfő
  await bad(post("/api/admin/weekly-plan", { action: "propose", week: "holnap", theme: "x" }), main.POST);
  await bad(post("/api/admin/weekly-plan", { action: "propose", week: NEXT_WEEK, theme: 42 }), main.POST);
  await bad(post("/api/admin/weekly-plan", { action: "propose", week: NEXT_WEEK }), main.POST); // téma/brief nélkül
  await bad(post("/api/admin/weekly-plan", { action: "propose", week: NEXT_WEEK, theme: "x".repeat(501) }), main.POST);
  await bad(post("/api/admin/weekly-plan", { action: "propose", week: NEXT_WEEK, brief: "x".repeat(200_000) }), main.POST);
  await bad(post("/api/admin/weekly-plan", { action: "approve", week: NEXT_WEEK }), main.POST); // expectedUpdatedAt nélkül
  await bad(post("/api/admin/weekly-plan", { action: "approve_days", week: NEXT_WEEK, dates: ["nem-datum"] }), main.POST);
  await bad(post("/api/admin/weekly-plan", { action: "update", week: NEXT_WEEK, expectedUpdatedAt: "x", days: "nem tömb" }), main.POST);
  await bad(get("?week=hamis"), main.GET);
  await bad(post("/api/admin/weekly-plan/day", { week: NEXT_WEEK, date: "nem-datum" }), day.POST);
  await bad(post("/api/admin/weekly-plan/day", { week: NEXT_WEEK, date: NEXT_WEEK, force: "igen" }), day.POST);

  assert.equal(gemini.calls.length, 0, "érvénytelen bemenetnél nincs Gemini-hívás");
});

test("teljes folyamat az API-n át: terv, finomítás, ütközés, jóváhagyás, napi generálás, áhítat-jóváhagyás", async () => {
  const { main, day } = await routes();

  // Üres hét
  const empty = await (await main.GET(get(`?week=${NEXT_WEEK}`))).json();
  assert.equal(empty.plan, null);
  assert.equal(empty.weekId, NEXT_WEEK);
  assert.equal(empty.days.length, 7);
  assert.match(empty.briefFormat, /"days"/);

  // Tervezés Geminivel
  gemini.planReplies.push({ text: planJson() });
  const proposed = await main.POST(post("/api/admin/weekly-plan", { action: "propose", week: NEXT_WEEK, theme: "Bizalom" }));
  assert.equal(proposed.status, 200);
  const first = await proposed.json();
  assert.equal(first.plan.status, "draft");

  // Finomítás a jelenlegi tervből
  gemini.planReplies.push({ text: planJson({ theme: "Mélyebb bizalom" }) });
  const revised = await main.POST(
    post("/api/admin/weekly-plan", {
      action: "revise",
      week: NEXT_WEEK,
      instruction: "Legyen mélyebb a téma.",
      expectedUpdatedAt: first.plan.updatedAt,
    })
  );
  assert.equal(revised.status, 200);
  const second = await revised.json();
  assert.equal(second.plan.theme, "Mélyebb bizalom");
  assert.match(gemini.planCalls().at(-1)!.user, /Csendes bizalom/, "a korábbi tervből indult");

  // Elavult időbélyeg: 409 és a friss terv
  const conflict = await main.POST(
    post("/api/admin/weekly-plan", {
      action: "update",
      week: NEXT_WEEK,
      theme: "Régi alapon",
      expectedUpdatedAt: first.plan.updatedAt,
    })
  );
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json();
  assert.equal(conflictBody.code, "PLAN_CONFLICT");
  assert.equal(conflictBody.plan.theme, "Mélyebb bizalom");

  // Jóváhagyás
  const approved = await main.POST(
    post("/api/admin/weekly-plan", { action: "approve", week: NEXT_WEEK, expectedUpdatedAt: second.plan.updatedAt })
  );
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).plan.status, "approved");

  // Napi generálás — a második nap hiányos, az első sikeres
  gemini.bodyReplies.push({ text: FULL_BODY });
  const ok = await day.POST(post("/api/admin/weekly-plan/day", { week: NEXT_WEEK, date: NEXT_WEEK }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).devotional.status, "needs_review");

  gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });
  gemini.bodyReplies.push({ text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" });
  const failed = await day.POST(
    post("/api/admin/weekly-plan/day", { week: NEXT_WEEK, date: addDaysToIsoDate(NEXT_WEEK, 1) })
  );
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).code, "DAY_INCOMPLETE");

  // Kész nap véletlen újraindítása: 409
  const again = await day.POST(post("/api/admin/weekly-plan/day", { week: NEXT_WEEK, date: NEXT_WEEK }));
  assert.equal(again.status, 409);

  // Áttekintés: napi állapotok és rekordok
  const overview = await (await main.GET(get(`?week=${NEXT_WEEK}`))).json();
  assert.equal(overview.plan.days[0].state, "ready");
  assert.equal(overview.plan.days[1].state, "failed");
  assert.equal(overview.days[0].devotional.status, "needs_review");
  assert.equal(overview.days[1].devotional, null);

  // Áhítat-jóváhagyás
  const approveDays = await main.POST(post("/api/admin/weekly-plan", { action: "approve_days", week: NEXT_WEEK }));
  const outcome = await approveDays.json();
  assert.deepEqual(outcome.changed, [NEXT_WEEK]);
  assert.equal(outcome.skipped.length, 6);
});

test("nem strukturált import: 422 BRIEF_NOT_STRUCTURED; nem jóváhagyható terv: 422 NOT_APPROVABLE", async () => {
  const { main } = await routes();

  const unstructured = await main.POST(
    post("/api/admin/weekly-plan", { action: "import", week: NEXT_WEEK, text: "Egy békés hét legyen." })
  );
  assert.equal(unstructured.status, 422);
  const body = await unstructured.json();
  assert.equal(body.code, "BRIEF_NOT_STRUCTURED");
  assert.ok(body.problems.length > 0);
  assert.equal(gemini.calls.length, 0);

  const imported = await main.POST(
    post("/api/admin/weekly-plan", { action: "import", week: NEXT_WEEK, text: planJson() })
  );
  const plan = (await imported.json()).plan;
  const blanked = await main.POST(
    post("/api/admin/weekly-plan", {
      action: "update",
      week: NEXT_WEEK,
      expectedUpdatedAt: plan.updatedAt,
      days: [{ date: NEXT_WEEK, title: "" }],
    })
  );
  const blankedPlan = (await blanked.json()).plan;
  const notApprovable = await main.POST(
    post("/api/admin/weekly-plan", {
      action: "approve",
      week: NEXT_WEEK,
      expectedUpdatedAt: blankedPlan.updatedAt,
    })
  );
  assert.equal(notApprovable.status, 422);
  const issues = (await notApprovable.json()).issues;
  assert.ok(issues.errors.some((e: string) => e.includes("hiányzik a cím")));
});

test("a hibaválaszok nem szivárogtatnak belső adatot (verem, token, kulcs)", async () => {
  const { day } = await routes();
  gemini.bodyReplies.push({ httpStatus: 500 });
  const { main } = await routes();
  const imported = await (
    await main.POST(post("/api/admin/weekly-plan", { action: "import", week: NEXT_WEEK, text: planJson() }))
  ).json();
  await main.POST(
    post("/api/admin/weekly-plan", { action: "approve", week: NEXT_WEEK, expectedUpdatedAt: imported.plan.updatedAt })
  );

  const res = await day.POST(post("/api/admin/weekly-plan/day", { week: NEXT_WEEK, date: NEXT_WEEK }));
  assert.equal(res.status, 500);
  const text = JSON.stringify(await res.json());
  assert.equal(text.includes("test-key"), false);
  assert.equal(/\bat\s+\S+\.ts:\d+/.test(text), false, "nincs stack trace");
});
