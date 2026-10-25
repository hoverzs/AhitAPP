import { BlobNotFoundError, del, put } from "@vercel/blob";
import { StorageBackendError } from "../errors";
import { BLOB_ACCESS, type BlobAuth } from "./config";
import type { ImageBlobStore } from "./image-store";

/** A képek véletlen utótagos útvonalon változatlanok — hosszan gyorsítótárazhatók. */
const IMAGE_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function authOptions(auth: BlobAuth): { storeId?: string; token?: string } {
  return {
    ...(auth.storeId ? { storeId: auth.storeId } : {}),
    ...(auth.token ? { token: auth.token } : {}),
  };
}

/**
 * Valódi képtár-adapter: NYILVÁNOS Vercel Blob store. Az A–D fázisban nincs
 * bekötve élesben; a getImageStore() (storage/index.ts) csak STORAGE_DRIVER=blob
 * és beállított képtár-hitelesítés esetén hozza létre.
 */
export function createVercelImageStore(auth: BlobAuth): ImageBlobStore {
  return {
    async put(pathname, bytes, contentType) {
      try {
        const result = await put(pathname, Buffer.from(bytes), {
          access: BLOB_ACCESS.images,
          contentType,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: IMAGE_CACHE_MAX_AGE_SECONDS,
          ...authOptions(auth),
        });
        return { url: result.url };
      } catch (error) {
        throw new StorageBackendError(error);
      }
    },

    async del(urls) {
      if (urls.length === 0) return;
      try {
        await del(urls, authOptions(auth));
      } catch (error) {
        if (error instanceof BlobNotFoundError) return;
        throw new StorageBackendError(error);
      }
    },
  };
}
