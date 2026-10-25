import assert from "node:assert/strict";
import { test } from "node:test";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { StorageBackendError } from "../src/lib/storage/errors";
import {
  BLOB_PATHS,
  createBlobStorage,
  type StorageMeta,
} from "../src/lib/storage/blob/blob-storage";
import {
  BlobAlreadyExistsError,
  BlobPreconditionError,
} from "../src/lib/storage/blob/client";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { mapVercelBlobError } from "../src/lib/storage/blob/vercel-client";
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
    content: `## Tartalom\n\nSzöveg ${date}`,
    imageUrl: "",
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
    ...overrides,
  };
}

function setup(initialToday = "2026-10-24") {
  const clock = { today: initialToday };
  const client = new MemoryBlobClient();
  const storage = createBlobStorage(client, { today: () => clock.today });
  return { clock, client, storage };
}

test("mentés: rekord, index, pillanatkép és meta jön létre, list nélkül", async () => {
  const { client, storage } = setup();

  await storage.saveDevotional(devotional(1, "2026-10-24"));

  assert.deepEqual(client.paths(), [
    "devotionals/2026-10-24.json",
    "index.json",
    "meta.json",
    "public-window.json",
  ]);
  // Első mentés: rekord + index + pillanatkép (hiányzó → újraépítés) + meta.
  assert.equal(client.ops.advanced, 5);

  client.resetOps();
  await storage.saveDevotional(devotional(2, "2026-10-25", { status: "draft" }));
  // Piszkozat: rekord + index + pillanatkép-karbantartás + meta.
  assert.equal(client.ops.advanced, 4);
});

test("duplikált dátum elutasítva; azonos \"sorszámú\" cím más napon engedélyezett", async () => {
  const { storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-10-24"));

  await assert.rejects(
    storage.saveDevotional(devotional(2, "2026-10-24")),
    /már van áhítat/
  );
  await storage.saveDevotional(devotional(1, "2026-10-25")); // nincs napszám-egyediség
});

test("a pillanatkép nem tartalmaz versionHistory-t, a rekord igen", async () => {
  const { client, storage } = setup();
  await storage.saveDevotional(
    devotional(1, "2026-10-24", {
      versionHistory: [
        {
          savedAt: "2026-10-24T08:00:00Z",
          reason: "regenerate",
          title: "régi",
          verse: "v",
          content: "régi tartalom",
        },
      ] as never,
      lastApiError: "valami hiba",
    })
  );

  const window = await storage.getPublicWindowDevotionals();
  assert.equal(window?.length, 1);
  assert.equal(window?.[0].versionHistory, undefined);
  assert.equal(window?.[0].lastApiError, undefined);

  const record = await storage.getDevotionalByDate("2026-10-24");
  assert.equal(record?.versionHistory?.length, 1);
  assert.ok(client.peek("devotionals/2026-10-24.json")?.includes("versionHistory"));
});

test("közzététel és visszavonás azonnal átvezetődik a pillanatképen", async () => {
  const { storage } = setup();
  const draft = devotional(1, "2026-10-24", { status: "draft" });
  await storage.saveDevotional(draft);
  assert.deepEqual(await storage.getPublicWindowDevotionals(), []);

  await storage.updateDevotional("2026-10-24", { ...draft, status: "published" });
  assert.equal((await storage.getPublicWindowDevotionals())?.length, 1);

  await storage.updateDevotional("2026-10-24", { ...draft, status: "draft" });
  assert.deepEqual(await storage.getPublicWindowDevotionals(), []);
});

test("üres tartalmú közzétett áhítat nem kerül a nyilvános ablakba", async () => {
  const { storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-10-24", { content: "  " }));
  assert.deepEqual(await storage.getPublicWindowDevotionals(), []);
});

test("rekordszintű ütközés: a közben módosított rekordot nem írja felül", async () => {
  const { client, storage } = setup();
  const base = devotional(1, "2026-10-24");
  await storage.saveDevotional(base);

  let injected = false;
  client.beforePut = (pathname) => {
    if (pathname === BLOB_PATHS.record("2026-10-24") && !injected) {
      injected = true;
      client.seed(pathname, JSON.stringify({ ...base, title: "Másik szerkesztő" }));
    }
  };

  await assert.rejects(
    storage.updateDevotional("2026-10-24", { ...base, title: "Az én változatom" }),
    /közben más módosította/
  );
  assert.equal((await storage.getDevotionalByDate("2026-10-24"))?.title, "Másik szerkesztő");
});

test("index-ütközésnél újraolvas és egyesít (nincs elveszett bejegyzés)", async () => {
  const { client, storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-10-24"));

  let injected = false;
  client.beforePut = (pathname) => {
    if (pathname === BLOB_PATHS.index && !injected) {
      injected = true;
      const doc = JSON.parse(client.peek(BLOB_PATHS.index)!);
      doc.entries.push({
        date: "2026-10-23",
        status: "published",
        title: "Másik író",
      });
      client.seed(BLOB_PATHS.index, JSON.stringify(doc));
    }
  };

  await storage.saveDevotional(devotional(2, "2026-10-25", { status: "draft" }));

  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  const dates = index.entries.map((e: { date: string }) => e.date).sort();
  assert.deepEqual(dates, ["2026-10-23", "2026-10-24", "2026-10-25"]);
});

test("párhuzamos mentések: minden bejegyzés bekerül az indexbe és a pillanatképbe", async () => {
  const { client, storage } = setup();

  // Valódi egyidejűség: az emulátor minden műveletnél átadja a vezérlést.
  const original = client.putText.bind(client);
  client.putText = async (...args) => {
    await new Promise((resolve) => setImmediate(resolve));
    return original(...args);
  };

  const days = [20, 21, 22, 23, 24];
  const results = await Promise.allSettled(
    days.map((day, i) =>
      storage.saveDevotional(devotional(i + 1, `2026-10-${day}`))
    )
  );

  const failures = results.filter((r) => r.status === "rejected");
  assert.equal(failures.length, 0, `elbukott mentések: ${JSON.stringify(failures)}`);

  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  assert.equal(index.entries.length, 5);
  const window = JSON.parse(client.peek(BLOB_PATHS.publicWindow)!);
  assert.equal(window.devotionals.length, 5);
  const meta = JSON.parse(client.peek(BLOB_PATHS.meta)!);
  assert.equal(meta.recentDays.length, 5);
});

test("dátumváltoztatás áthelyezi a rekordot", async () => {
  const { client, storage } = setup();
  const d = devotional(1, "2026-10-24");
  await storage.saveDevotional(d);

  await storage.updateDevotional("2026-10-24", { ...d, date: "2026-10-26" });

  assert.equal(client.has("devotionals/2026-10-24.json"), false);
  assert.equal(client.has("devotionals/2026-10-26.json"), true);
  const index = JSON.parse(client.peek(BLOB_PATHS.index)!);
  assert.deepEqual(
    index.entries.map((e: { date: string }) => e.date),
    ["2026-10-26"]
  );
});

test("törlés eltávolítja a rekordot, az indexet és a pillanatképet", async () => {
  const { client, storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-10-24"));
  await storage.saveDevotional(devotional(2, "2026-10-23"));

  await storage.deleteDevotional("2026-10-23");

  assert.equal(client.has("devotionals/2026-10-23.json"), false);
  assert.equal((await storage.getLatestDevotionals()).length, 1);
  assert.deepEqual(
    (await storage.getPublicWindowDevotionals())?.map((d) => d.date),
    ["2026-10-24"]
  );
  await assert.rejects(storage.deleteDevotional("2026-10-23"), /Nincs áhítat/);
});

test("admin munkakészlet: cutoff utáni + jövőbeli rekordok, régi nem", async () => {
  const { storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-09-01"));
  await storage.saveDevotional(devotional(2, "2026-10-20"));
  await storage.saveDevotional(devotional(3, "2026-10-26", { status: "draft" }));

  const fromCutoff = await storage.getDevotionalsFromDate("2026-10-17");
  assert.deepEqual(fromCutoff.map((d) => d.title), ["Cím 3", "Cím 2"]);

  // A régi rekord nem kerül be (nincs „legutóbbi mindig marad” kivétel).
  const { storage: s2 } = setup();
  await s2.saveDevotional(devotional(5, "2026-08-01"));
  assert.deepEqual((await s2.getDevotionalsFromDate("2026-10-17")).map((d) => d.title), []);

  const byDates = await storage.getDevotionalsByDates(["2026-10-20", "2026-01-01"]);
  assert.deepEqual(byDates.map((d) => d.title), ["Cím 2"]);
});

test("napváltás írás nélkül: a mai és a 7 napos ablak a dátumból adódik", async () => {
  const { clock, storage } = setup("2026-10-24");
  await storage.saveDevotional(devotional(1, "2026-10-24"));
  await storage.saveDevotional(devotional(2, "2026-10-26"));

  const datesAt = async (today: string) => {
    clock.today = today;
    return (await storage.getPublicWindowDevotionals())?.map((d) => d.date);
  };

  assert.deepEqual(await datesAt("2026-10-24"), ["2026-10-24"]); // jövőbeli még nem látszik
  assert.deepEqual(await datesAt("2026-10-26"), ["2026-10-26", "2026-10-24"]);
  assert.deepEqual(await datesAt("2026-10-31"), ["2026-10-26", "2026-10-24"]);
  assert.deepEqual(await datesAt("2026-11-01"), ["2026-10-26"]); // 10-24 már lejárt (>7 nap)
});

test("hiányzó pillanatkép: null, nem üres lista", async () => {
  const { storage } = setup();
  assert.equal(await storage.getPublicWindowDevotionals(), null);
});

test("részleges írási hiba után a rebuild() helyreállítja az indexet és a pillanatképet", async () => {
  const { client, storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-10-23"));

  client.failOnce({
    operation: "put",
    pathname: BLOB_PATHS.index,
    error: new StorageBackendError(new Error("fetch failed")),
  });
  await assert.rejects(storage.saveDevotional(devotional(2, "2026-10-24")), StorageBackendError);

  // A rekord megvan, az index és a pillanatkép még nem tud róla.
  assert.equal(client.has("devotionals/2026-10-24.json"), true);
  assert.deepEqual(
    JSON.parse(client.peek(BLOB_PATHS.index)!).entries.map((e: { date: string }) => e.date),
    ["2026-10-23"]
  );

  const result = await storage.rebuild();
  assert.equal(result.records, 2);
  assert.deepEqual(
    (await storage.getPublicWindowDevotionals())?.map((d) => d.date),
    ["2026-10-24", "2026-10-23"]
  );
  assert.equal((await storage.getLatestDevotionals()).length, 2);
});

test("rebuild(): index, pillanatkép és meta nélkül is újraépül, a meta nem szűkül", async () => {
  const { client, storage } = setup();
  await storage.saveDevotional(devotional(1, "2026-10-23"));
  await storage.saveDevotional(devotional(2, "2026-10-24"));

  // A régi, már törölt napok emlékezete a metában él.
  const meta = JSON.parse(client.peek(BLOB_PATHS.meta)!) as StorageMeta;
  meta.usedVerseReferences.push("Máté 5:3");
  client.seed(BLOB_PATHS.meta, JSON.stringify(meta));

  client.remove(BLOB_PATHS.index);
  client.remove(BLOB_PATHS.publicWindow);

  await storage.rebuild();

  assert.equal((await storage.getLatestDevotionals()).length, 2);
  assert.equal((await storage.getPublicWindowDevotionals())?.length, 2);
  const rebuilt = await storage.getMeta();
  assert.ok(rebuilt?.usedVerseReferences.includes("Máté 5:3"));
});

test("meta: egyedi igehelyek, recentDays legfeljebb 21, dátum szerint", async () => {
  const { storage } = setup();
  for (let day = 1; day <= 30; day++) {
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    await storage.saveDevotional(
      devotional(day, date, { verse: day % 2 ? "Róma 8:28 — x" : `Ján ${day}:1 — y` })
    );
  }

  const meta = await storage.getMeta();
  assert.equal(meta?.recentDays.length, 21);
  assert.equal(meta?.recentDays[0].date, "2026-10-10");
  assert.equal(meta?.usedVerseReferences.filter((v) => v === "Róma 8:28").length, 1);
});

test("műveleti költségvetés: egy tipikus nap messze a Hobby-keret alatt marad", async () => {
  const { client, storage } = setup();
  const d = devotional(1, "2026-10-24");
  await storage.saveDevotional({ ...d, status: "draft" });

  client.resetOps();
  // Közzététel + egy szerkesztés
  await storage.updateDevotional("2026-10-24", d);
  await storage.updateDevotional("2026-10-24", { ...d, title: "Javított cím" });
  const adminAdvanced = client.ops.advanced;

  client.resetOps();
  for (let i = 0; i < 30; i++) await storage.getPublicWindowDevotionals();

  assert.equal(client.ops.simple, 30); // 1 olvasás / oldalmegjelenítés (a Next cache ezt tovább csökkenti)
  assert.equal(client.ops.advanced, 0); // nyilvános olvasás nem ír és nem listáz
  assert.ok(adminAdvanced <= 10, `admin írások: ${adminAdvanced}`);
  assert.equal(client.ops.deletes, 0);
});

test("Vercel adapter hibaleképezése", () => {
  assert.ok(
    mapVercelBlobError(new BlobPreconditionFailedError(), "index.json") instanceof
      BlobPreconditionError
  );
  assert.ok(
    mapVercelBlobError(new Error("This blob already exists"), "x.json") instanceof
      BlobAlreadyExistsError
  );
  const other = mapVercelBlobError(new Error("Vercel Blob: Service unavailable"), "x.json");
  assert.ok(other instanceof StorageBackendError);
});
