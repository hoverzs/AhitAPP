import assert from "node:assert/strict";
import { test } from "node:test";
import { entryToListItem, entryToStub } from "../src/lib/admin-entries";
import { createBlobStorage, BLOB_PATHS } from "../src/lib/storage/blob/blob-storage";
import { createBlobJobStore, jobBlobPath } from "../src/lib/storage/blob/job-store";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import type { Devotional } from "../src/lib/types";

function devotional(
  n: number,
  date: string,
  overrides: Partial<Devotional> = {}
): Devotional {
  return {
    date,
    title: `Cím ${n}`,
    verse: `Róma ${n}:1 — teszt vers`,
    content: `## Tartalom\n\nSzöveg ${date} `.repeat(40),
    imageUrl: "",
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
    ...overrides,
  };
}

function setup(today = "2026-10-24") {
  const client = new MemoryBlobClient();
  let changes = 0;
  const storage = createBlobStorage(client, {
    today: () => today,
    onChange: () => {
      changes += 1;
    },
  });
  return { client, storage, changes: () => changes };
}

test("listAdminEntries: könnyű sorok a rekordok olvasása nélkül", async () => {
  const { client, storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-09-01"));
  await storage.saveDevotional(
    devotional(2, "2026-10-20", {
      editedByAdmin: true,
      generatedAt: "2026-10-20T00:10:00Z",
      lastApiError: "x".repeat(500),
    })
  );
  await storage.saveDevotional(devotional(3, "2026-10-26", { status: "draft" }));

  client.resetOps();
  const entries = await storage.listAdminEntries("2026-10-17");

  // Egyetlen olvasás (index), rekordolvasás nélkül.
  assert.equal(client.ops.simple, 1);
  assert.equal(client.ops.advanced, 0);
  assert.deepEqual(entries.map((e) => e.title), ["Cím 3", "Cím 2"]);
  assert.equal(entries[1].editedByAdmin, true);
  assert.equal(entries[1].verse, "Róma 2:1 — teszt vers");
  assert.equal(entries[1].lastApiError?.length, 200); // az index nem hizlalható
  assert.equal(JSON.stringify(entries).includes("Szöveg"), false); // nincs tartalom
});

test("listAdminEntries: a határ előtti (régi) rekord nem kerül a listába", async () => {
  const { storage } = setup();
  await storage.saveDevotional(devotional(7, "2026-08-01"));
  const entries = await storage.listAdminEntries("2026-10-17");
  assert.deepEqual(entries, []);
});

test("getDevotionalByDate: egyetlen rekord, a teljes készlet olvasása nélkül", async () => {
  const { client, storage } = setup();
  for (let day = 1; day <= 6; day++) {
    await storage.saveDevotional(devotional(day, `2026-10-${String(day + 10)}`));
  }

  client.resetOps();
  const found = await storage.getDevotionalByDate("2026-10-14");
  assert.equal(found?.title, "Cím 4");
  assert.equal(client.ops.simple, 1); // egyetlen rekord, nem 6+1
  assert.equal(await storage.getDevotionalByDate("2026-12-31"), undefined);
});

test("onChange minden sikeres írás után lefut, olvasás után nem", async () => {
  const { storage, changes } = setup();
  const d = devotional(1, "2026-10-24");

  await storage.saveDevotional(d);
  assert.equal(changes(), 1);

  await storage.getDevotionalByDate("2026-10-24");
  await storage.getPublicWindowDevotionals();
  await storage.listAdminEntries("2026-10-17");
  assert.equal(changes(), 1);

  await storage.updateDevotional("2026-10-24", { ...d, title: "Új" });
  assert.equal(changes(), 2);
  await storage.deleteDevotional("2026-10-24");
  assert.equal(changes(), 3);
  await storage.rebuild();
  assert.equal(changes(), 4);
});

test("sikertelen írásnál az onChange nem fut le", async () => {
  const { storage, changes } = setup();
  await storage.saveDevotional(devotional(1, "2026-10-24"));
  const before = changes();
  await assert.rejects(storage.saveDevotional(devotional(2, "2026-10-24")), /már van áhítat/);
  assert.equal(changes(), before);
});

test("index-sor → admin listasor és csonk rekord", () => {
  const entry = {
    date: "2026-10-24",
    status: "needs_review" as const,
    title: "Cím",
    verse: "Zsolt 23:1 — ...",
    category: "Hit",
    generatedAt: "2026-10-24T00:10:00Z",
    updatedAt: "2026-10-24T01:00:00Z",
    editedByAdmin: false,
    lastApiError: "csonka",
  };

  assert.deepEqual(entryToListItem(entry), {
    date: "2026-10-24",
    title: "Cím",
    verse: "Zsolt 23:1 — ...",
    status: "needs_review",
    generatedAt: "2026-10-24T00:10:00Z",
    updatedAt: "2026-10-24T01:00:00Z",
    editedByAdmin: false,
    category: "Hit",
  });

  const stub = entryToStub(entry);
  assert.equal(stub.content, ""); // csonk: soha nem mentendő / megjelenítendő
  assert.equal(stub.lastApiError, "csonka");
  assert.equal(stub.createdAt, "2026-10-24T00:10:00Z");
  assert.equal(entryToListItem({ ...entry, verse: undefined }).verse, "");
});

test("régi, bővítés előtti index-sor is kezelhető", () => {
  const legacy = { date: "2026-10-24", status: "published" as const, title: "T" };
  assert.equal(entryToListItem(legacy).verse, "");
  assert.match(entryToStub(legacy).createdAt, /^2026-10-24T/);
});

test("generálási feladat tár: mentés, olvasás, törlés", async () => {
  const client = new MemoryBlobClient();
  const jobs = createBlobJobStore<{ date: string; status: string; retry_count: number }>(client);

  assert.equal(await jobs.get("2026-10-24"), null);

  await jobs.save({ date: "2026-10-24", status: "running", retry_count: 0 });
  await jobs.save({ date: "2026-10-24", status: "published", retry_count: 1 });

  assert.equal(client.has(jobBlobPath("2026-10-24")), true);
  assert.equal((await jobs.get("2026-10-24"))?.status, "published");

  await jobs.delete("2026-10-24");
  assert.equal(await jobs.get("2026-10-24"), null);
  assert.equal(client.has(jobBlobPath("2026-10-24")), false);
});

test("egy generálási nap összetett műveletei: feladat + áhítat együtt is a keret töredéke", async () => {
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => "2026-10-24" });
  const jobs = createBlobJobStore<{ date: string; status: string }>(client);

  // running → generálás → published (3 feladat-írás), + áhítat mentése
  await jobs.save({ date: "2026-10-24", status: "running" });
  await storage.saveDevotional(devotional(1, "2026-10-24"));
  await storage.saveDevotional(devotional(2, "2026-10-23")); // csak a második mentés ára
  client.resetOps();
  await jobs.save({ date: "2026-10-24", status: "published" });
  await storage.updateDevotional("2026-10-24", devotional(1, "2026-10-24", { title: "Szerkesztve" }));

  assert.ok(client.ops.advanced <= 6, `összetett műveletek: ${client.ops.advanced}`);
  assert.equal(client.paths().includes(BLOB_PATHS.index), true);
});
