/**
 * A Blob-meghajtó bekötése az alkalmazás rétegeibe (devotionals.ts, app-data.ts,
 * generation-job-storage.ts) memóriabeli Blob-klienssel. Éles Blobhoz nem nyúl.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import {
  resolveStorageDriver,
  setBlobClientForTesting,
  getDevotionalStorage,
} from "../src/lib/storage";
import { getAppTodayIso } from "../src/lib/app-date";
import type { Devotional } from "../src/lib/types";

const today = getAppTodayIso();

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function devotional(dayNumber: number, date: string, overrides: Partial<Devotional> = {}): Devotional {
  return {
    dayNumber,
    date,
    title: `Cím ${dayNumber}`,
    verse: `Róma ${dayNumber}:1 — teszt vers`,
    content: `## Tartalom\n\nSzöveg ${date}`,
    imageUrl: "",
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
    ...overrides,
  };
}

const client = new MemoryBlobClient();

before(() => {
  setBlobClientForTesting(client);
});
after(() => {
  setBlobClientForTesting(null);
});

test("a Blob-meghajtó csak kifejezett STORAGE_DRIVER=blob esetén kapcsol be", () => {
  assert.equal(resolveStorageDriver(), "blob");

  const previous = process.env.STORAGE_DRIVER;
  process.env.STORAGE_DRIVER = "";
  assert.notEqual(resolveStorageDriver(), "blob");
  process.env.STORAGE_DRIVER = "redis";
  assert.equal(resolveStorageDriver(), "redis");
  process.env.STORAGE_DRIVER = previous;
});

test("a meghajtó lusta admin-képességekkel rendelkezik", () => {
  const storage = getDevotionalStorage();
  assert.equal(typeof storage.listAdminEntries, "function");
  assert.equal(typeof storage.getDevotionalByDayNumber, "function");
});

test("alkalmazásréteg: mentés, nyilvános ablak, lusta admin és módosítások", async () => {
  const { appendDevotional, getPublicWindowDevotionals, getDevotionalByDay, updateDevotionalStatus, saveDevotionalAdminEdit, upsertDevotional } =
    await import("../src/lib/devotionals");
  const { loadAdminPageData } = await import("../src/lib/app-data");

  await appendDevotional(devotional(1, addDays(today, -3)));
  await appendDevotional(devotional(2, addDays(today, -1)));
  await appendDevotional(devotional(3, today, { status: "draft" }));
  await appendDevotional(devotional(4, addDays(today, 2), { status: "draft" }));

  // Nyilvános: csak a közzétett, ablakon belüli napok — egyetlen olvasás a pillanatképből.
  client.resetOps();
  const publicWindow = await getPublicWindowDevotionals();
  assert.deepEqual(publicWindow.map((d) => d.dayNumber), [2, 1]);
  assert.equal(client.ops.simple, 1);
  assert.equal(client.ops.advanced, 0);

  // Lusta admin: könnyű sorok + csak a mai (függő) nap teljes rekordja.
  client.resetOps();
  const admin = await loadAdminPageData();
  assert.equal(admin.storageError, null);
  assert.deepEqual(admin.listItems.map((i) => i.dayNumber), [4, 3, 2, 1]);
  assert.deepEqual(admin.devotionals.map((d) => d.dayNumber), [3]); // csak a mai nap rekordja
  assert.equal(admin.reviewDevotional?.dayNumber, 3);
  assert.equal(client.ops.advanced, 0);
  assert.ok(client.ops.simple <= 6, `admin olvasások: ${client.ops.simple}`);
  assert.equal(admin.adminContext.generationTarget.action, "update"); // a mai napra már van piszkozat

  // Napszám szerinti keresés index + egy rekord.
  client.resetOps();
  assert.equal((await getDevotionalByDay(2))?.title, "Cím 2");
  assert.equal(client.ops.simple, 2);

  // Közzététel: a pillanatkép azonnal frissül, a teljes készlet olvasása nélkül.
  client.resetOps();
  const published = await updateDevotionalStatus(3, "published");
  assert.equal(published.status, "published");
  assert.ok(client.ops.simple <= 8, `közzététel olvasásai: ${client.ops.simple}`);
  assert.deepEqual((await getPublicWindowDevotionals()).map((d) => d.dayNumber), [3, 2, 1]);

  // Szerkesztés és upsert ugyanazon a napszámon.
  await saveDevotionalAdminEdit(3, { title: "Szerkesztett cím" });
  assert.equal((await getDevotionalByDay(3))?.title, "Szerkesztett cím");
  await upsertDevotional({ ...devotional(3, today), title: "Upsert cím" });
  assert.equal((await getDevotionalByDay(3))?.title, "Upsert cím");
  assert.equal(
    getDevotionalStorage().getDevotionalByDayNumber ? true : false,
    true
  );
});

test("a generálási feladat a Blobba kerül (jobs/<dátum>.json)", async () => {
  const { getGenerationJob, saveGenerationJob, deleteGenerationJob } = await import(
    "../src/lib/generation-job-storage"
  );
  const { createEmptyGenerationJob } = await import("../src/lib/generation-job-types");

  assert.equal(await getGenerationJob(today), null);
  const job = createEmptyGenerationJob(today);
  await saveGenerationJob({ ...job, status: "running" });
  assert.ok(client.has(`jobs/${today}.json`));
  assert.equal((await getGenerationJob(today))?.status, "running");
  await deleteGenerationJob(today);
  assert.equal(await getGenerationJob(today), null);
});

test("tárolóhiba az admin betöltőben tárolóhibaként jelenik meg", async () => {
  const { loadAdminPageData } = await import("../src/lib/app-data");
  const { StorageBackendError } = await import("../src/lib/storage/errors");

  client.failOnce({
    operation: "get",
    pathname: "index.json",
    times: 10,
    error: new StorageBackendError(
      new Error("ERR This database has reached current Fixed plan limits.")
    ),
  });

  const admin = await loadAdminPageData();
  assert.equal(admin.storageReason, "rate_limited");
  assert.match(admin.storageError ?? "", /korlát/);
  assert.deepEqual(admin.listItems, []);
});
