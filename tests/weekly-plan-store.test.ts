import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { createLocalJsonClient } from "../src/lib/storage/local-json-client";
import {
  createWeeklyPlanStore,
  getWeeklyPlanStore,
  REGISTRY_PATH,
  WeeklyPlanExistsError,
  WeeklyPlanNotFoundError,
  WeeklyPlanUnsupportedError,
  WeeklyPlanValidationError,
  weeklyPlanPath,
} from "../src/lib/weekly-plan/store";
import { createEmptyWeeklyPlan } from "../src/lib/weekly-plan/types";

const WEEK = "2026-10-26";
const NOW = new Date("2026-10-23T10:00:00.000Z");

function store(client = new MemoryBlobClient(), now = NOW) {
  return {
    client,
    store: createWeeklyPlanStore(client, { now: () => now, today: () => "2026-10-26" }),
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    ...createEmptyWeeklyPlan({ weekId: WEEK, source: "gemini", theme: "Bizalom", now: NOW }),
    ...overrides,
  };
}

test("terv: létrehozás, olvasás, a Blob-úton plans/<hétfő>.json", async () => {
  const { client, store: s } = store();
  assert.equal(await s.getPlan(WEEK), null);

  const created = await s.createPlan(plan());
  assert.equal(created.weekId, WEEK);
  assert.equal(client.has(weeklyPlanPath(WEEK)), true);
  assert.equal(weeklyPlanPath(WEEK), "plans/2026-10-26.json");

  const read = await s.getPlan(WEEK);
  assert.equal(read?.theme, "Bizalom");
  assert.equal(read?.days.length, 7);
});

test("terv: ugyanarra a hétre nem hozható létre kétszer", async () => {
  const { store: s } = store();
  await s.createPlan(plan());
  await assert.rejects(s.createPlan(plan({ theme: "Másik" })), WeeklyPlanExistsError);
  assert.equal((await s.getPlan(WEEK))?.theme, "Bizalom");
});

test("terv: módosítás megtartja a létrehozás idejét, frissíti a módosítását", async () => {
  const client = new MemoryBlobClient();
  const first = store(client, new Date("2026-10-23T10:00:00.000Z")).store;
  await first.createPlan(plan());

  const later = store(client, new Date("2026-10-24T12:00:00.000Z")).store;
  const updated = await later.updatePlan(WEEK, (p) => ({ ...p, theme: "Új téma", status: "draft" }));
  assert.equal(updated.theme, "Új téma");
  assert.equal(updated.createdAt, "2026-10-23T10:00:00.000Z");
  assert.equal(updated.updatedAt, "2026-10-24T12:00:00.000Z");
});

test("terv: hiányzó hét módosítása hiba; érvénytelen hét vagy tartalom nem mentődik", async () => {
  const { client, store: s } = store();
  await assert.rejects(s.updatePlan(WEEK, (p) => p), WeeklyPlanNotFoundError);
  await assert.rejects(s.getPlan("2026-10-27"), WeeklyPlanValidationError); // nem hétfő

  await s.createPlan(plan());
  await assert.rejects(
    s.updatePlan(WEEK, (p) => ({ ...p, days: p.days.slice(0, 5) })),
    WeeklyPlanValidationError
  );
  await assert.rejects(
    s.updatePlan(WEEK, (p) => ({ ...p, weekId: "2026-11-02" })),
    /nem változtatható/
  );
  // a hibás módosítás után az eredeti terv érintetlen
  assert.equal((await s.getPlan(WEEK))?.days.length, 7);
  assert.equal(client.has(weeklyPlanPath("2026-11-02")), false);
});

test("terv: az egyidejű módosítások nem vesznek el (optimista zárolás)", async () => {
  const { store: s } = store();
  await s.createPlan(plan());

  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map((i) =>
      s.updatePlan(WEEK, (p) => {
        p.days[i].title = `Nap ${i + 1}`;
        return p;
      })
    )
  );
  const result = await s.getPlan(WEEK);
  assert.deepEqual(
    result?.days.map((d) => d.title),
    [1, 2, 3, 4, 5, 6, 7].map((n) => `Nap ${n}`)
  );
});

test("terv: törlés", async () => {
  const { client, store: s } = store();
  await s.createPlan(plan());
  await s.deletePlan(WEEK);
  assert.equal(await s.getPlan(WEEK), null);
  assert.equal(client.has(weeklyPlanPath(WEEK)), false);
});

test("nyilvántartás: üresen indul, beírás, 90 napnál régebbi kihullik, egyidejűen sem vész el", async () => {
  const { client, store: s } = store();
  assert.deepEqual((await s.getRegistry()).entries, []);

  await s.recordInRegistry([
    { date: "2026-01-01", reference: "Régi 1:1", title: "Nagyon régi" },
    { date: "2026-10-20", reference: "Új 1:1", title: "Friss" },
  ]);
  const afterFirst = await s.getRegistry();
  assert.deepEqual(
    afterFirst.entries.map((e) => e.title),
    ["Friss"]
  );
  assert.equal(client.has(REGISTRY_PATH), true);

  await Promise.all(
    [1, 2, 3, 4].map((n) =>
      s.recordInRegistry([{ date: `2026-10-2${n}`, reference: `Ige ${n}:1`, title: `T${n}` }])
    )
  );
  const dates = (await s.getRegistry()).entries.map((e) => e.date);
  for (const d of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]) {
    assert.ok(dates.includes(d), `${d} megvan`);
  }
});

test("nyilvántartás: a jóváhagyott terv igehelyei kerülnek be", async () => {
  const { store: s } = store();
  const filled = await s.createPlan(
    (() => {
      const p = plan();
      p.days.forEach((d, i) => {
        d.title = `C${i}`;
        d.verse = `Ige ${i + 1}:1`;
      });
      return p;
    })()
  );
  const registry = await s.recordPlanInRegistry(filled);
  assert.equal(registry.entries.length, 7);
  assert.ok(registry.entries.every((e) => e.weekId === WEEK));
});

test("helyi fájlkliens: ugyanaz a tár fájlrendszeren, ETag-os zárolással", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ahit-weekly-"));
  try {
    const s = createWeeklyPlanStore(createLocalJsonClient(dir), { now: () => NOW });
    await s.createPlan(plan());
    await assert.rejects(s.createPlan(plan()), WeeklyPlanExistsError);

    await Promise.all(
      [0, 1, 2].map((i) =>
        s.updatePlan(WEEK, (p) => {
          p.days[i].title = `Helyi ${i}`;
          return p;
        })
      )
    );
    const read = await s.getPlan(WEEK);
    assert.deepEqual(
      read?.days.slice(0, 3).map((d) => d.title),
      ["Helyi 0", "Helyi 1", "Helyi 2"]
    );
    assert.deepEqual(await readdir(path.join(dir, "plans")), ["2026-10-26.json"]);
    await assert.rejects(
      createLocalJsonClient(dir).getText("../kiszokes.json"),
      /Érvénytelen útvonal/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Redis meghajtón a heti terv nem érhető el", () => {
  const previous = process.env.STORAGE_DRIVER;
  process.env.STORAGE_DRIVER = "redis";
  try {
    assert.throws(() => getWeeklyPlanStore(), WeeklyPlanUnsupportedError);
  } finally {
    if (previous === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = previous;
  }
});

test("terv: az updatedAt minden mentésnél szigorúan nő, azonos ezredmásodpercben is", async () => {
  const { store: s } = store();
  const created = await s.createPlan(plan());
  let previous = created.updatedAt;
  for (let i = 0; i < 5; i++) {
    const next = await s.updatePlan(WEEK, (p) => ({ ...p, theme: `Téma ${i}` }));
    assert.ok(next.updatedAt > previous, `${next.updatedAt} > ${previous}`);
    previous = next.updatedAt;
  }
});
