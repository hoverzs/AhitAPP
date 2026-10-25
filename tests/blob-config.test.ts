import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOB_ACCESS,
  getDataBlobAuth,
  getImagesBlobAuth,
  isBlobStorageConfigured,
  isImageBlobConfigured,
} from "../src/lib/storage/blob/config";
import { storageErrorReason } from "../src/lib/storage/errors";

const KEYS = [
  "BLOB_STORE_ID",
  "BLOB_DATA_STORE_ID",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_IMAGES_STORE_ID",
  "BLOB_IMAGES_READ_WRITE_TOKEN",
] as const;

function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, run: () => void) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("hozzáférési mód: az adatok privátak, csak a képek nyilvánosak", () => {
  assert.equal(BLOB_ACCESS.data, "private");
  assert.equal(BLOB_ACCESS.images, "public");
});

test("adat store beállítása: OIDC store id vagy token, enélkül nincs konfigurálva", () => {
  withEnv({}, () => assert.equal(isBlobStorageConfigured(), false));
  withEnv({ BLOB_STORE_ID: "store_a" }, () => assert.equal(isBlobStorageConfigured(), true));
  withEnv({ BLOB_DATA_STORE_ID: "store_d" }, () => {
    assert.equal(isBlobStorageConfigured(), true);
    assert.equal(getDataBlobAuth().storeId, "store_d");
  });
  withEnv({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }, () =>
    assert.equal(isBlobStorageConfigured(), true)
  );
  withEnv({ BLOB_STORE_ID: "   " }, () => assert.equal(isBlobStorageConfigured(), false));
});

test("képtár beállítása külön: a képek nem használják az adat store hitelesítését", () => {
  // Csak az adat store van beállítva → képfeltöltés nem elérhető.
  withEnv({ BLOB_STORE_ID: "store_a", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_data" }, () => {
    assert.equal(isImageBlobConfigured(), false);
    assert.equal(getImagesBlobAuth().token, undefined);
  });
  withEnv({ BLOB_IMAGES_STORE_ID: "store_img" }, () => {
    assert.equal(isImageBlobConfigured(), true);
    assert.equal(getImagesBlobAuth().storeId, "store_img");
  });
  withEnv({ BLOB_IMAGES_READ_WRITE_TOKEN: "vercel_blob_rw_img" }, () => {
    assert.equal(isImageBlobConfigured(), true);
    assert.equal(getImagesBlobAuth().token, "vercel_blob_rw_img");
  });
});

test("Blob SDK hibaüzenetek hozzáférési hibának minősülnek", () => {
  assert.equal(storageErrorReason(new Error("Vercel Blob: This store does not exist.")), "unauthorized");
  assert.equal(storageErrorReason(new Error("Vercel Blob: No token found. Either configure the `BLOB_READ_WRITE_TOKEN`")), "unauthorized");
  assert.equal(storageErrorReason(new Error("Vercel Blob: Access denied, please provide a valid token")), "unauthorized");
  assert.equal(storageErrorReason(new Error("fetch failed")), "network");
});
