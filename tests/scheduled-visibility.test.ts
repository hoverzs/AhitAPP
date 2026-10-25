process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import React from "react";
import { addDaysToIsoDate, getAppTodayIso } from "../src/lib/app-date";
import {
  filterCalendarDevotionals,
  filterPublicDevotionals,
  isPublicDevotional,
  isPublicStatus,
} from "../src/lib/devotional-status";
import { setBlobClientForTesting } from "../src/lib/storage";
import { createBlobStorage, BLOB_PATHS } from "../src/lib/storage/blob/blob-storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import type { Devotional, DevotionalStatus } from "../src/lib/types";

const WEEK = "2026-10-26";
const SECRET_TITLE = "TITKOS-HOLNAPI-CIM";
const SECRET_VERSE = "Titok 9:9 — TITKOS-IGE";
const SECRET_BODY = "TITKOS-TARTALOM";

function record(
  date: string,
  status: DevotionalStatus,
  overrides: Partial<Devotional> = {}
): Devotional {
  return {
    date,
    title: `Cím ${date}`,
    verse: "Zsoltárok 23:1 — Az Úr az én pásztorom",
    content: `## Szöveg\n\nTartalom ${date}. `.repeat(20),
    imageUrl: "",
    createdAt: `${date}T08:00:00.000Z`,
    status,
    category: "Hit",
    ...overrides,
  };
}

function secret(date: string, overrides: Partial<Devotional> = {}): Devotional {
  return record(date, "approved", {
    weekId: WEEK,
    title: SECRET_TITLE,
    verse: SECRET_VERSE,
    content: `## Elmélkedés\n\n${SECRET_BODY} `.repeat(30),
    facebookCopy: SECRET_BODY,
    ...overrides,
  });
}

function assertNoSecret(value: unknown, label: string): void {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of [SECRET_TITLE, SECRET_BODY, "TITKOS-IGE"]) {
    assert.equal(text.includes(marker), false, `${label}: kiszivárgott: ${marker}`);
  }
}

// ── szabály (tiszta függvények) ─────────────────────────────────────────────

test("státusz: a published mindig, az approved csak heti sorozatnál nyilvános", () => {
  assert.equal(isPublicStatus("published"), true);
  assert.equal(isPublicStatus(undefined), true); // régi rekord státusz nélkül
  assert.equal(isPublicStatus("approved", WEEK), true);
  assert.equal(isPublicStatus("approved"), false); // régi napi folyamat: jóváhagyás ≠ közzététel
  assert.equal(isPublicStatus("approved", "  "), false);
  assert.equal(isPublicStatus("needs_review", WEEK), false);
  assert.equal(isPublicStatus("draft", WEEK), false);
});

test("nyilvánosság: jövőbeli nap soha nem nyilvános, bármilyen státusszal", () => {
  const today = "2026-10-28";
  const cases: [string, Devotional][] = [
    ["published, ma", record("2026-10-28", "published")],
    ["approved+hét, ma", record("2026-10-28", "approved", { weekId: WEEK })],
    ["approved+hét, tegnap", record("2026-10-27", "approved", { weekId: WEEK })],
  ];
  for (const [label, d] of cases) assert.equal(isPublicDevotional(d, today), true, label);

  const hidden: [string, Devotional][] = [
    ["published, holnap", record("2026-10-29", "published")],
    ["approved+hét, holnap", record("2026-10-29", "approved", { weekId: WEEK })],
    ["approved+hét, egy hét múlva", record("2026-11-04", "approved", { weekId: WEEK })],
    ["approved hét nélkül, ma", record("2026-10-28", "approved")],
    ["draft+hét, ma", record("2026-10-28", "draft", { weekId: WEEK })],
    ["approved+hét, üres tartalom", record("2026-10-28", "approved", { weekId: WEEK, content: "  " })],
  ];
  for (const [label, d] of hidden) assert.equal(isPublicDevotional(d, today), false, label);

  assert.equal(filterPublicDevotionals(hidden.map(([, d]) => d), today).length, 0);
  assert.equal(filterCalendarDevotionals(hidden.map(([, d]) => d), today).length, 0);
});

test("éjfélváltás: a holnapi jóváhagyott nap a nap váltásakor magától látszik", () => {
  const d = record("2026-10-29", "approved", { weekId: WEEK });
  assert.equal(isPublicDevotional(d, "2026-10-28"), false);
  assert.equal(isPublicDevotional(d, "2026-10-29"), true);
});

// ── Blob tároló ─────────────────────────────────────────────────────────────

test("Blob: a jövőbeli jóváhagyott napok a pillanatképben vannak, de olvasáskor nem látszanak", async () => {
  const client = new MemoryBlobClient();
  let now = "2026-10-28";
  const storage = createBlobStorage(client, { today: () => now });

  for (let i = 0; i < 7; i++) {
    const date = addDaysToIsoDate(WEEK, i);
    await storage.saveDevotional(record(date, "approved", { weekId: WEEK, title: `Nap ${i + 1}` }));
  }

  const snapshot = JSON.parse(client.peek(BLOB_PATHS.publicWindow)!);
  assert.equal(snapshot.devotionals.length, 7, "a pillanatkép tartalmazza az ütemezett napokat");

  let visible = (await storage.getPublicWindowDevotionals())!.map((d) => d.date).sort();
  assert.deepEqual(visible, ["2026-10-26", "2026-10-27", "2026-10-28"]);

  // Éjfél: írás nélkül megjelenik a következő nap.
  now = "2026-10-29";
  visible = (await storage.getPublicWindowDevotionals())!.map((d) => d.date).sort();
  assert.deepEqual(visible, ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);

  // A hétnapos ablak is elmozdul: 11-04-én a 10-26 már kiesik.
  now = "2026-11-04";
  visible = (await storage.getPublicWindowDevotionals())!.map((d) => d.date).sort();
  assert.equal(visible.includes("2026-10-26"), false);
  assert.equal(visible.includes("2026-11-01"), true);
});

test("Blob: heti azonosító nélküli jóváhagyott rekord nem kerül a nyilvános ablakba", async () => {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => "2026-10-28" });
  await storage.saveDevotional(record("2026-10-28", "approved")); // régi napi folyamat
  await storage.saveDevotional(record("2026-10-27", "published"));

  const window = (await storage.getPublicWindowDevotionals())!;
  assert.deepEqual(window.map((d) => d.date), ["2026-10-27"]);
});

test("Blob: a jóváhagyás visszavonása azonnal kiveszi a napot a nyilvános ablakból", async () => {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => "2026-10-28" });
  const approved = record("2026-10-28", "approved", { weekId: WEEK });
  await storage.saveDevotional(approved);
  assert.equal((await storage.getPublicWindowDevotionals())!.length, 1);

  await storage.updateDevotional("2026-10-28", { ...approved, status: "needs_review" });
  assert.equal((await storage.getPublicWindowDevotionals())!.length, 0);
});

test("Blob: az index tárolja a heti azonosítót, a pillanatkép újraépítése is megtartja", async () => {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => "2026-10-28" });
  await storage.saveDevotional(record("2026-10-28", "approved", { weekId: WEEK }));
  await storage.saveDevotional(record("2026-10-27", "approved")); // heti azonosító nélkül

  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  assert.equal(index.entries.find((e: { date: string }) => e.date === "2026-10-28").weekId, WEEK);

  client.remove(BLOB_PATHS.publicWindow);
  await storage.rebuildPublicWindow();
  const window = (await storage.getPublicWindowDevotionals())!;
  assert.deepEqual(window.map((d) => d.date), ["2026-10-28"]);
});

test("Blob megőrzés: a lejárt heti (jóváhagyott) nap törölhető, a heti azonosító nélküli nem", async () => {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => "2026-11-10" });
  await storage.saveDevotional(record("2026-10-20", "approved", { weekId: "2026-10-19" }));
  await storage.saveDevotional(record("2026-10-21", "approved")); // régi napi jóváhagyott
  await storage.saveDevotional(record("2026-11-09", "published"));

  const preview = await storage.runRetention({ apply: false });
  assert.deepEqual(preview.removable, ["2026-10-20"]);
  assert.deepEqual(preview.keptUnpublished, ["2026-10-21"]);
});

// ── alkalmazásréteg: API, egyedi URL, Open Graph ────────────────────────────

beforeEach(() => {
  setBlobClientForTesting(new MemoryBlobClient());
});

async function seedWeek() {
  const today = getAppTodayIso();
  const { appendDevotional } = await import("../src/lib/devotionals");
  const tomorrow = addDaysToIsoDate(today, 1);
  const later = addDaysToIsoDate(today, 6);
  await appendDevotional(secret(tomorrow));
  await appendDevotional(secret(later));
  await appendDevotional(secret(addDaysToIsoDate(today, 3), { status: "published" })); // tévesen published
  return { today, tomorrow, later };
}

test("nyilvános ablak és API: a jövőbeli jóváhagyott nap nem érhető el", async () => {
  await seedWeek();
  const { getPublicWindowDevotionals } = await import("../src/lib/devotionals");
  const { GET } = await import("../src/app/api/devotionals/route");

  assert.deepEqual(await getPublicWindowDevotionals(), []);
  const response = await GET();
  const body = await response.json();
  assert.deepEqual(body.devotionals, []);
  assertNoSecret(body, "/api/devotionals");
});

test("egyedi URL: a jövőbeli nap 'nem elérhető', tartalom nélkül", async () => {
  const { tomorrow, later } = await seedWeek();
  const { lookupPublicDevotionalByDate } = await import("../src/lib/devotionals");
  const { resolveDevotionalView } = await import("../src/lib/devotional-view");
  // A tsx teszt-futtató klasszikus JSX-et használ: a React globálisan kell.
  (globalThis as { React?: unknown }).React = React;
  const page = await import("../src/app/devotional/[date]/page");

  for (const date of [tomorrow, later, addDaysToIsoDate(tomorrow, 40)]) {
    assert.equal((await lookupPublicDevotionalByDate(date)).kind, "missing", date);
    assert.equal((await resolveDevotionalView(date)).kind, "missing", date);

    const element = await page.default({ params: Promise.resolve({ date }) });
    assertNoSecret(element, `/devotional/${date} oldal`);
    assert.match(JSON.stringify(element), /missing/);
  }
});

test("Open Graph: a jövőbeli nap metaadata nem árul el címet, igét, képet", async () => {
  const { tomorrow, later } = await seedWeek();
  const { generateMetadata } = await import("../src/app/devotional/[date]/page");

  for (const date of [tomorrow, later]) {
    const meta = await generateMetadata({ params: Promise.resolve({ date }) });
    assertNoSecret(meta, `metadata ${date}`);
    assert.equal(meta.openGraph, undefined, "nincs og:* a nem elérhető napra");
    assert.equal(meta.twitter, undefined);
    assert.deepEqual(meta.robots, { index: false });
  }
});

test("főoldal és menü: a jövőbeli nap sem a listában, sem a 'mai nap' hivatkozásban nem szerepel", async () => {
  const { tomorrow } = await seedWeek();
  const { loadHomePageData, loadSiteNavData } = await import("../src/lib/app-data");

  const home = await loadHomePageData();
  assert.equal(home.latest, null);
  assert.deepEqual(home.devotionals, []);
  assert.ok(home.days.every((d) => d.devotional === null));
  assertNoSecret(home, "főoldal");

  const nav = await loadSiteNavData();
  assert.equal(nav.todayHref.includes(tomorrow), false);
  assert.equal(nav.publishedCount, 0);
});

test("a pillanatkép nélküli tartalék útvonal sem hoz be jövőbeli napot", async () => {
  await seedWeek();
  const { getPublicWindowDevotionals } = await import("../src/lib/devotionals");
  const client = new MemoryBlobClient();
  setBlobClientForTesting(client);
  const { appendDevotional } = await import("../src/lib/devotionals");
  await appendDevotional(secret(addDaysToIsoDate(getAppTodayIso(), 1)));
  client.remove(BLOB_PATHS.publicWindow);

  assert.deepEqual(await getPublicWindowDevotionals(), []);
});

test("a saját napján a jóváhagyott heti áhítat megjelenik: ablak, URL, metaadat", async () => {
  const today = getAppTodayIso();
  const { appendDevotional, getPublicWindowDevotionals } = await import("../src/lib/devotionals");
  const { resolveDevotionalView } = await import("../src/lib/devotional-view");
  const { generateMetadata } = await import("../src/app/devotional/[date]/page");

  await appendDevotional(
    secret(today, { title: "Mai áhítat", verse: "Zsoltárok 23:1 — Az Úr az én pásztorom" })
  );

  const window = await getPublicWindowDevotionals();
  assert.equal(window.length, 1);
  assert.equal((await resolveDevotionalView(today)).kind, "ok");

  const meta = await generateMetadata({ params: Promise.resolve({ date: today }) });
  const og = meta.openGraph as { url?: string; type?: string };
  assert.equal(og.url, `https://ahitapp.example/devotional/${today}`);
  assert.equal(og.type, "article");
});

test("a jóváhagyás visszavonása után a mai nap újra elérhetetlen (API és URL)", async () => {
  const today = getAppTodayIso();
  const { appendDevotional, updateDevotionalStatus, getPublicWindowDevotionals } = await import(
    "../src/lib/devotionals"
  );
  const { resolveDevotionalView } = await import("../src/lib/devotional-view");

  await appendDevotional(secret(today));
  assert.equal((await getPublicWindowDevotionals()).length, 1);

  await updateDevotionalStatus(today, "needs_review");
  assert.equal((await getPublicWindowDevotionals()).length, 0);
  assert.equal((await resolveDevotionalView(today)).kind, "missing");
});
