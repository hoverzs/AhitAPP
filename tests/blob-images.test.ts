/**
 * Képfeltöltés és képéletciklus a Blob meghajtóval (memóriabeli adat- és képtár).
 * Éles Blobhoz nem nyúl.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
delete process.env.BLOB_IMAGES_STORE_ID;
delete process.env.BLOB_IMAGES_READ_WRITE_TOKEN;

import {
  ImageUploadError,
  MAX_UPLOAD_BYTES,
  sniffImageType,
  uploadDevotionalImage,
} from "../src/lib/devotional-image-upload";
import {
  appendDevotional,
  clearDevotionalImage,
  deleteDevotionalByDate,
  getDevotionalByDate,
  saveDevotionalPexelsImage,
  upsertDevotional,
} from "../src/lib/devotionals";
import { MemoryImageStore, isOwnedBlobImageUrl } from "../src/lib/storage/blob/image-store";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { StorageBackendError } from "../src/lib/storage/errors";
import {
  getImageStore,
  setBlobClientForTesting,
  setImageStoreForTesting,
} from "../src/lib/storage";
import type { Devotional } from "../src/lib/types";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

function devotional(n: number, date: string, overrides: Partial<Devotional> = {}): Devotional {
  return {
    date,
    title: `Cím ${n}`,
    verse: `Róma ${n}:1 — teszt vers`,
    content: `## Tartalom\n\nSzöveg ${date}`,
    imageUrl: "",
    createdAt: `${date}T08:00:00.000Z`,
    status: "draft",
    ...overrides,
  };
}

const client = new MemoryBlobClient();
const images = new MemoryImageStore();

before(() => {
  setBlobClientForTesting(client);
  setImageStoreForTesting(images);
});
after(() => {
  setBlobClientForTesting(null);
  setImageStoreForTesting(null);
});

test("fájltípus a bájtokból: JPEG / PNG / WebP igen, SVG / HTML / GIF / üres nem", () => {
  assert.equal(sniffImageType(JPEG)?.mime, "image/jpeg");
  assert.equal(sniffImageType(PNG)?.ext, "png");
  assert.equal(sniffImageType(WEBP)?.mime, "image/webp");

  const text = (s: string) => new TextEncoder().encode(s);
  assert.equal(sniffImageType(text("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(sniffImageType(text("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffImageType(text("GIF89a......")), null);
  assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])), null); // RIFF, de nem WebP
  assert.equal(sniffImageType(new Uint8Array()), null);
});

test("saját képtár-URL felismerése: csak a nyilvános store images/ útvonala", () => {
  assert.equal(isOwnedBlobImageUrl("https://abc123.public.blob.vercel-storage.com/images/2026-10-24/day-1-x.jpg"), true);
  assert.equal(isOwnedBlobImageUrl("https://images.pexels.com/photos/1/a.jpeg"), false);
  assert.equal(isOwnedBlobImageUrl("https://abc123.public.blob.vercel-storage.com/devotionals/2026-10-24.json"), false);
  assert.equal(isOwnedBlobImageUrl("http://abc123.public.blob.vercel-storage.com/images/a.jpg"), false);
  assert.equal(isOwnedBlobImageUrl("/images/devotionals/day-1.jpg"), false);
  assert.equal(isOwnedBlobImageUrl("nem url"), false);
  assert.equal(isOwnedBlobImageUrl(undefined), false);
});

test("a képtár külön store: a Blob meghajtóval elérhető, az adatok nem kerülnek bele", async () => {
  assert.equal(getImageStore(), images);
  await appendDevotional(devotional(1, "2026-10-24"));

  const { imageUrl } = await uploadDevotionalImage({ date: "2026-10-24", bytes: JPEG });

  // A kép a képtárban, az áhítat-adatok az adat storeban — kereszt-szennyezés nélkül.
  assert.equal(images.size(), 1);
  assert.ok(client.paths().every((p) => !p.startsWith("images/")), "az adat store-ba nem kerül kép");
  assert.ok(images.urls().every((u) => /\/images\//.test(u)), "a képtárba csak images/ útvonal kerül");
  assert.ok(!images.urls().some((u) => u.endsWith(".json")), "a képtárba nem kerül JSON");
  assert.match(imageUrl, /\/images\/2026-10-24\/devotional-/);
  assert.equal(isOwnedBlobImageUrl(imageUrl), true);
});

test("feltöltés után a rekord a képre mutat, kézi forrásként", async () => {
  const saved = await getDevotionalByDate("2026-10-24");
  assert.equal(saved?.imageSource, "manual");
  assert.equal(saved?.imageUrl, images.urls()[0]);
  // A piszkozat adat privát storeban van (nincs publikus URL-je).
  assert.equal(client.has("devotionals/2026-10-24.json"), true);
});

test("kép cseréjekor a régi saját kép törlődik", async () => {
  const first = images.urls()[0];
  const { imageUrl } = await uploadDevotionalImage({ date: "2026-10-24", bytes: PNG });

  assert.notEqual(imageUrl, first);
  assert.equal(images.has(first), false, "a régi kép törölve");
  assert.equal(images.has(imageUrl), true);
  assert.equal(images.size(), 1);
});

test("Pexels-képre váltáskor a saját kép törlődik; a Pexels-kép törlésekor nem történik képtár-törlés", async () => {
  const own = images.urls()[0];

  await saveDevotionalPexelsImage("2026-10-24", {
    imageUrl: "https://images.pexels.com/photos/9/p.jpeg",
    imageCredit: "Fotós",
    imagePhotographerUrl: "https://www.pexels.com/@f",
  });
  assert.equal(images.has(own), false);
  assert.equal(images.size(), 0);

  const deletesBefore = images.ops.deletes;
  await clearDevotionalImage("2026-10-24"); // külső kép eltávolítása
  assert.equal(images.ops.deletes, deletesBefore, "külső képhez nem nyúl a képtár");
});

test("a kép eltávolítása (clear) törli a saját képet", async () => {
  const { imageUrl } = await uploadDevotionalImage({ date: "2026-10-24", bytes: WEBP });
  assert.equal(images.has(imageUrl), true);

  await clearDevotionalImage("2026-10-24");
  assert.equal(images.has(imageUrl), false);
  assert.equal((await getDevotionalByDate("2026-10-24"))?.imageUrl, "");
});

test("upsert (pl. újragenerálás) más képre cserélve szintén törli a régi saját képet", async () => {
  const { imageUrl } = await uploadDevotionalImage({ date: "2026-10-24", bytes: JPEG });
  const current = (await getDevotionalByDate("2026-10-24"))!;

  await upsertDevotional({ ...current, imageUrl: "https://images.pexels.com/photos/5/q.jpeg" });
  assert.equal(images.has(imageUrl), false);
});

test("az áhítat törlése a saját képét is törli", async () => {
  const { imageUrl } = await uploadDevotionalImage({ date: "2026-10-24", bytes: JPEG });
  await deleteDevotionalByDate("2026-10-24");
  assert.equal(images.has(imageUrl), false);
  assert.equal(await getDevotionalByDate("2026-10-24"), undefined);
});

test("érvénytelen feltöltések: típus, méret, üres, hiányzó nap", async () => {
  await appendDevotional(devotional(2, "2026-10-25"));
  const before = images.size();

  const svg = new TextEncoder().encode("<svg onload='alert(1)'></svg>");
  await assert.rejects(uploadDevotionalImage({ date: "2026-10-25", bytes: svg }), (e) => {
    assert.ok(e instanceof ImageUploadError);
    assert.equal(e.status, 400);
    return true;
  });

  const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  big.set(JPEG);
  await assert.rejects(uploadDevotionalImage({ date: "2026-10-25", bytes: big }), /5 MB/);
  await assert.rejects(uploadDevotionalImage({ date: "2026-10-25", bytes: new Uint8Array() }), /Üres/);
  await assert.rejects(uploadDevotionalImage({ date: "2026-12-31", bytes: JPEG }), (e) => {
    assert.ok(e instanceof ImageUploadError);
    assert.equal(e.status, 404);
    return true;
  });

  assert.equal(images.size(), before, "elutasított feltöltés nem hagy képet");
});

test("ha a rekord mentése elbukik, a feltöltött kép visszavonódik", async () => {
  const before = images.size();
  client.failOnce({
    operation: "put",
    pathname: "devotionals/2026-10-25.json",
    error: new StorageBackendError(new Error("fetch failed")),
  });

  await assert.rejects(uploadDevotionalImage({ date: "2026-10-25", bytes: JPEG }), StorageBackendError);
  assert.equal(images.size(), before, "nem marad árva kép");
});

test("képtár nélkül a Blob meghajtón a feltöltés érthető 503-mal elutasított", async () => {
  setImageStoreForTesting(null); // nincs BLOB_IMAGES_* beállítva
  try {
    await assert.rejects(uploadDevotionalImage({ date: "2026-10-25", bytes: JPEG }), (e) => {
      assert.ok(e instanceof ImageUploadError);
      assert.equal(e.status, 503);
      assert.match(e.message, /képtár/);
      return true;
    });
  } finally {
    setImageStoreForTesting(images);
  }
});

test("a képtár-hiba a régi kép törlésekor nem akadályozza a mentést", async () => {
  const { imageUrl } = await uploadDevotionalImage({ date: "2026-10-25", bytes: JPEG });
  const realDel = images.del.bind(images);
  images.del = async () => {
    throw new Error("képtár nem elérhető");
  };
  try {
    const updated = await clearDevotionalImage("2026-10-25"); // a mentés sikeres, a törlés elbukik
    assert.equal(updated.imageUrl, "");
    assert.equal(images.has(imageUrl), true, "árva kép marad, de az adat konzisztens");
  } finally {
    images.del = realDel;
  }
});
