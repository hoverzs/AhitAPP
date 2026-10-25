/**
 * Blob-hitelesítés beállításai. Két store van:
 *  - adat store (privát): áhítatok, index, pillanatkép, meta, feladatok
 *  - képtár (nyilvános): csak feltöltött képek
 *
 * Adat store: BLOB_DATA_STORE_ID (OIDC), különben az SDK alapértelmezése
 *   (BLOB_STORE_ID vagy BLOB_READ_WRITE_TOKEN).
 * Képtár: BLOB_IMAGES_STORE_ID (OIDC) vagy BLOB_IMAGES_READ_WRITE_TOKEN.
 */
/**
 * Hozzáférési mód: az áhítat-adatok (piszkozatok, admin adatok, feladatok)
 * PRIVÁT storeban; csak a feltöltött képek nyilvánosak. A mód a store
 * létrehozása után nem módosítható.
 */
export const BLOB_ACCESS = { data: "private", images: "public" } as const;

export interface BlobAuth {
  storeId?: string;
  token?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getDataBlobAuth(): BlobAuth {
  return { storeId: clean(process.env.BLOB_DATA_STORE_ID) };
}

export function getImagesBlobAuth(): BlobAuth {
  return {
    storeId: clean(process.env.BLOB_IMAGES_STORE_ID),
    token: clean(process.env.BLOB_IMAGES_READ_WRITE_TOKEN),
  };
}

/**
 * Van-e hitelesítés az adat storehoz? OIDC (BLOB_STORE_ID / BLOB_DATA_STORE_ID
 * + a Vercel által kiadott VERCEL_OIDC_TOKEN) vagy a BLOB_READ_WRITE_TOKEN.
 */
export function isBlobStorageConfigured(): boolean {
  return Boolean(
    clean(process.env.BLOB_DATA_STORE_ID) ||
      clean(process.env.BLOB_STORE_ID) ||
      clean(process.env.BLOB_READ_WRITE_TOKEN)
  );
}

export function isImageBlobConfigured(): boolean {
  const auth = getImagesBlobAuth();
  return Boolean(auth.storeId || auth.token);
}
