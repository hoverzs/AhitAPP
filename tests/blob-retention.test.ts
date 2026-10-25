import assert from "node:assert/strict";
import { test } from "node:test";
import { StorageBackendError } from "../src/lib/storage/errors";
import { BLOB_PATHS, createBlobStorage } from "../src/lib/storage/blob/blob-storage";
import {
  MemoryImageStore,
  isOwnedBlobImageUrl,
} from "../src/lib/storage/blob/image-store";
import { jobBlobPath } from "../src/lib/storage/blob/job-store";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import {
  buildDevotionalMemory,
  mergeStoredMetaIntoMemory,
} from "../src/lib/devotional-memory";
import type { Devotional } from "../src/lib/types";

const TODAY = "2026-10-24"; // cutoff (7 nap): 2026-10-17

function devotional(
  n: number,
  date: string,
  overrides: Partial<Devotional> = {}
): Devotional {
  return {
    date,
    title: `Cím ${n}`,
    verse: `Róma ${n}:1 — teszt vers`,
    content: `## Tartalom\n\nSzöveg ${date}`,
    imageUrl: "",
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
    ...overrides,
  };
}

async function ownImage(images: MemoryImageStore, name: string): Promise<string> {
  return (await images.put(`images/2026/${name}.jpg`, new Uint8Array([1, 2, 3]), "image/jpeg")).url;
}

/** Egy tipikus állapot: 2 régi közzétett (az egyiknek saját képe), 1 régi piszkozat, mai, jövőbeli. */
async function seedScenario() {
  const client = new MemoryBlobClient();
  const images = new MemoryImageStore();
  let changes = 0;
  const storage = createBlobStorage(client, {
    today: () => TODAY,
    images,
    onChange: () => {
      changes += 1;
    },
  });

  const ownUrl = await ownImage(images, "old");
  const pexels = "https://images.pexels.com/photos/1/pexels-photo-1.jpeg";

  await storage.saveDevotional(devotional(1, "2026-09-14", { imageUrl: ownUrl }));
  await storage.saveDevotional(devotional(2, "2026-10-12", { imageUrl: pexels }));
  await storage.saveDevotional(devotional(3, "2026-10-15", { status: "draft" }));
  await storage.saveDevotional(devotional(4, "2026-10-20"));
  await storage.saveDevotional(devotional(5, "2026-10-24"));
  await storage.saveDevotional(devotional(6, "2026-10-27", { status: "draft" }));
  client.seed(jobBlobPath("2026-09-14"), JSON.stringify({ date: "2026-09-14" }));
  client.seed(jobBlobPath("2026-10-12"), JSON.stringify({ date: "2026-10-12" }));
  client.seed("unrelated/other-app.json", "{}");

  return { client, images, storage, ownUrl, pexels, changes: () => changes };
}

test("retention előnézet: nem töröl, csak a régi + közzétett a jelölt", async () => {
  const { client, images, storage } = await seedScenario();
  const before = client.paths();
  const imagesBefore = images.size();

  client.resetOps();
  const result = await storage.runRetention({ apply: false });

  assert.deepEqual(result.removable, ["2026-09-14", "2026-10-12"]);
  assert.deepEqual(result.keptUnpublished, ["2026-10-15"]); // régi piszkozat marad
  assert.equal(result.deleted, false);
  assert.equal(result.cutoff, "2026-10-17");
  assert.deepEqual(client.paths(), before);
  assert.equal(images.size(), imagesBefore);
  assert.equal(client.ops.simple, 1); // csak az index
  assert.equal(client.ops.advanced, 0);
});

test("retention törlés: rekord, feladat, saját kép törlődik; külső kép, piszkozat, jövő, idegen blob marad", async () => {
  const { client, images, storage, ownUrl, pexels, changes } = await seedScenario();
  const changesBefore = changes();

  client.resetOps();
  const result = await storage.runRetention({ apply: true });

  assert.equal(result.deleted, true);
  assert.deepEqual(result.removable, ["2026-09-14", "2026-10-12"]);
  assert.equal(result.imagesDeleted, 1);
  assert.deepEqual(result.imagesFailed, []);

  // Törölve
  for (const date of ["2026-09-14", "2026-10-12"]) {
    assert.equal(client.has(BLOB_PATHS.record(date)), false, `${date} rekord`);
    assert.equal(client.has(jobBlobPath(date)), false, `${date} feladat`);
  }
  assert.equal(images.has(ownUrl), false);
  assert.equal(isOwnedBlobImageUrl(pexels), false);

  // Megmarad
  for (const date of ["2026-10-15", "2026-10-20", "2026-10-24", "2026-10-27"]) {
    assert.equal(client.has(BLOB_PATHS.record(date)), true, `${date} marad`);
  }
  assert.equal(client.has("unrelated/other-app.json"), true);
  assert.equal(client.has(BLOB_PATHS.meta), true); // a meta soha nem törlődik

  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  assert.deepEqual(
    index.entries.map((e: { date: string }) => e.date).sort(),
    ["2026-10-15", "2026-10-20", "2026-10-24", "2026-10-27"]
  );
  const window = JSON.parse(client.peek(BLOB_PATHS.publicWindow)!);
  assert.deepEqual(
    window.devotionals.map((d: { date: string }) => d.date).sort(),
    ["2026-10-20", "2026-10-24"]
  );

  // Gyorsítótár-frissítés + költségvetés (list nélkül)
  assert.equal(changes(), changesBefore + 1);
  assert.ok(client.ops.advanced <= 2, `összetett: ${client.ops.advanced}`); // index + pillanatkép
  assert.ok(client.ops.simple <= 3, `egyszerű: ${client.ops.simple}`);
});

test("retention: ha minden közzétett rekord régi, mind törölhető (nincs kivétel a legfrissebbre)", async () => {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => TODAY });
  await storage.saveDevotional(devotional(8, "2026-08-01"));
  await storage.saveDevotional(devotional(9, "2026-08-02"));

  const result = await storage.runRetention({ apply: true });
  assert.deepEqual(result.removable, ["2026-08-01", "2026-08-02"]);
  assert.equal(client.has(BLOB_PATHS.record("2026-08-02")), false);
});

test("retention kikapcsolva (DEVOTIONAL_RETENTION_DAYS=0): semmi nem jelölt", async () => {
  const { storage } = await seedScenario();
  const previous = process.env.DEVOTIONAL_RETENTION_DAYS;
  process.env.DEVOTIONAL_RETENTION_DAYS = "0";
  try {
    const result = await storage.runRetention({ apply: true });
    assert.deepEqual(result.removable, []);
    assert.equal(result.deleted, false);
  } finally {
    if (previous === undefined) delete process.env.DEVOTIONAL_RETENTION_DAYS;
    else process.env.DEVOTIONAL_RETENTION_DAYS = previous;
  }
});

test("egyidejű írás: a retention közben érkező új bejegyzés nem vész el", async () => {
  const { client, storage } = await seedScenario();

  let injected = false;
  client.beforePut = (pathname) => {
    if (pathname === BLOB_PATHS.index && !injected) {
      injected = true;
      const doc = JSON.parse(client.peek(BLOB_PATHS.index)!);
      doc.entries.push({
        date: "2026-10-25",
        status: "draft",
        title: "Közben érkezett",
        imageUrl: "",
      });
      client.seed(BLOB_PATHS.index, JSON.stringify(doc));
    }
  };

  const result = await storage.runRetention({ apply: true });
  assert.equal(result.deleted, true);
  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  const dates = index.entries.map((e: { date: string }) => e.date);
  assert.ok(dates.includes("2026-10-25"), "a közben érkezett bejegyzés megmarad");
  assert.ok(!dates.includes("2026-09-14") && !dates.includes("2026-10-12"));
});

test("egyidejű írás: a közben piszkozatba visszavont régi áhítat nem törlődik", async () => {
  const { client, storage } = await seedScenario();

  let injected = false;
  client.beforePut = (pathname) => {
    if (pathname === BLOB_PATHS.index && !injected) {
      injected = true;
      const doc = JSON.parse(client.peek(BLOB_PATHS.index)!);
      const entry = doc.entries.find((e: { date: string }) => e.date === "2026-10-12");
      entry.status = "draft"; // az admin közben visszavonta
      client.seed(BLOB_PATHS.index, JSON.stringify(doc));
    }
  };

  const result = await storage.runRetention({ apply: true });
  assert.deepEqual(result.removable, ["2026-09-14"]); // csak az, ami az írásnál is jogosult
  assert.equal(client.has(BLOB_PATHS.record("2026-10-12")), true);
  assert.equal(client.has(BLOB_PATHS.record("2026-09-14")), false);
});

test("megszakadt blobtörlés: élő adat nem vész, a következő futás befejezi", async () => {
  const { client, storage } = await seedScenario();

  client.failOnce({
    operation: "del",
    error: new StorageBackendError(new Error("fetch failed")),
  });
  await assert.rejects(storage.runRetention({ apply: true }), StorageBackendError);

  // Az index már tiszta, a rekordblobok árván megmaradtak — de nem élő adatok.
  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  assert.equal(index.entries.some((e: { date: string }) => e.date === "2026-09-14"), false);
  assert.equal(client.has(BLOB_PATHS.record("2026-09-14")), true);

  // A rebuild az árvákat visszaemeli, a retention pedig újra rendbe teszi.
  await storage.rebuild();
  const again = await storage.runRetention({ apply: true });
  assert.deepEqual(again.removable, ["2026-09-14", "2026-10-12"]);
  assert.equal(client.has(BLOB_PATHS.record("2026-09-14")), false);
});

test("képtörlés hibája: a rekord törlődik, a képek jelezve (árva marad, nem vész adat)", async () => {
  const { storage, images, ownUrl } = await seedScenario();
  images.del = async () => {
    throw new Error("képtár nem elérhető");
  };

  const result = await storage.runRetention({ apply: true });
  assert.equal(result.deleted, true);
  assert.equal(result.imagesDeleted, 0);
  assert.deepEqual(result.imagesFailed, [ownUrl]);
});

test("képtár nélkül futó retention a saját képeket árvának jelzi, nem dob hibát", async () => {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => TODAY });
  const images = new MemoryImageStore();
  const url = await ownImage(images, "x");
  await storage.saveDevotional(devotional(1, "2026-09-01", { imageUrl: url }));
  await storage.saveDevotional(devotional(2, "2026-10-24"));

  const result = await storage.runRetention({ apply: true });
  assert.deepEqual(result.imagesFailed, [url]);
  assert.equal(result.deleted, true);
});

test("régi, imageUrl nélküli indexsornál a rekordból olvassa a képet", async () => {
  const { client, storage, images, ownUrl } = await seedScenario();
  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  for (const e of index.entries) delete e.imageUrl; // bővítés előtti index
  client.seed(BLOB_PATHS.index, JSON.stringify(index));

  const result = await storage.runRetention({ apply: true });
  assert.equal(result.imagesDeleted, 1);
  assert.equal(images.has(ownUrl), false);
});

test("a törölt napok emlékezete (meta) a generálási memóriában megmarad", async () => {
  const { storage } = await seedScenario();
  await storage.runRetention({ apply: true });

  const remaining = await storage.getLatestDevotionals();
  assert.equal(remaining.some((d) => d.title === "Cím 1"), false); // az 1. nap törölve

  const meta = await storage.getMeta();
  const merged = mergeStoredMetaIntoMemory(
    buildDevotionalMemory(remaining, { targetDate: "2026-10-27" }),
    meta
  );
  assert.ok(merged.usedVerseReferences.includes("Róma 1:1"), "a törölt 1. nap igehelye használtnak számít");
  assert.ok(merged.usedTitles.includes("Cím 1"));
  assert.equal(merged.targetDate, "2026-10-27"); // a generálási cél a dátum
});

test("mergeStoredMetaIntoMemory: unió, sorrend, recentDays korlát, összefoglaló frissül", () => {
  const history = [devotional(30, "2026-10-24", { verse: "Ján 3:16 — x", category: "Remény" })];
  const memory = buildDevotionalMemory(history, { targetDate: "2026-10-25" });

  const recent = Array.from({ length: 25 }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    title: `T${i + 1}`,
    verseReference: `V${i + 1}`,
    category: "Hit",
  }));
  const merged = mergeStoredMetaIntoMemory(memory, {
    usedVerseReferences: ["Máté 5:3", "Ján 3:16"],
    usedTitles: ["Régi cím"],
    usedCategories: ["Hit"],
    recentDays: recent,
  });

  assert.deepEqual(merged.usedVerseReferences, ["Máté 5:3", "Ján 3:16"]); // nincs duplikátum
  assert.deepEqual(merged.usedCategories, ["Hit", "Remény"]);
  assert.equal(merged.recentDays.length, 21);
  assert.equal(merged.recentDays.at(-1)?.date, "2026-10-24");
  assert.equal(merged.targetDate, "2026-10-25");
  assert.ok(merged.summaryForPrompt.includes("Régi cím"));
  assert.ok(merged.summaryForPrompt.includes("Legutóbbi kategóriák: Hit, Remény"));

  assert.equal(mergeStoredMetaIntoMemory(memory, null), memory); // meta nélkül változatlan
});
