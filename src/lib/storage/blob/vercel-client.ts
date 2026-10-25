import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  list,
  put,
} from "@vercel/blob";
import { StorageBackendError } from "../errors";
import { BLOB_ACCESS } from "./config";
import {
  BlobAlreadyExistsError,
  BlobPreconditionError,
  type BlobGetOptions,
  type BlobPutOptions,
  type BlobTextResult,
  type JsonBlobClient,
} from "./client";

/**
 * A mutábilis JSON-dokumentumok gyorsítótár-ideje (másodperc). A Vercel Blob
 * minimuma 60 — felülíráskor a változás legfeljebb ennyit késik a CDN-ben.
 */
const JSON_CACHE_MAX_AGE_SECONDS = 60;

export type VercelBlobMappedError =
  | BlobPreconditionError
  | BlobAlreadyExistsError
  | StorageBackendError;

/** SDK-hiba → a tároló-réteg saját hibái (a hívók ezekre építenek). */
export function mapVercelBlobError(
  error: unknown,
  pathname: string
): VercelBlobMappedError {
  if (error instanceof BlobPreconditionFailedError) {
    return new BlobPreconditionError(pathname);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/already exists/i.test(message)) {
    return new BlobAlreadyExistsError(pathname);
  }
  return new StorageBackendError(error);
}

export interface VercelBlobClientOptions {
  /** Privát store (alapértelmezés) az áhítat-dokumentumoknak. */
  access?: "private" | "public";
  /** Kifejezett store (OIDC) — alapértelmezés: BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN. */
  storeId?: string;
  token?: string;
}

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

/**
 * Valódi Vercel Blob adapter. A hitelesítést az SDK intézi (OIDC:
 * BLOB_STORE_ID + VERCEL_OIDC_TOKEN, vagy BLOB_READ_WRITE_TOKEN).
 * Az A fázisban nincs bekötve az alkalmazásba.
 */
export function createVercelBlobClient(
  options: VercelBlobClientOptions = {}
): JsonBlobClient {
  const access = options.access ?? BLOB_ACCESS.data;
  const auth = {
    ...(options.storeId ? { storeId: options.storeId } : {}),
    ...(options.token ? { token: options.token } : {}),
  };

  return {
    async getText(pathname: string, getOptions?: BlobGetOptions) {
      try {
        const result = await get(pathname, {
          access,
          useCache: getOptions?.fresh ? false : true,
          ...auth,
        });
        if (!result || result.statusCode !== 200) return null;
        const text = await readText(result.stream);
        return { text, etag: result.blob.etag } satisfies BlobTextResult;
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw mapVercelBlobError(error, pathname);
      }
    },

    async putText(pathname: string, text: string, putOptions?: BlobPutOptions) {
      try {
        const result = await put(pathname, text, {
          access,
          contentType: putOptions?.contentType ?? "application/json",
          addRandomSuffix: false,
          allowOverwrite: putOptions?.overwrite !== false,
          cacheControlMaxAge: JSON_CACHE_MAX_AGE_SECONDS,
          ...(putOptions?.ifMatch ? { ifMatch: putOptions.ifMatch } : {}),
          ...auth,
        });
        return { etag: result.etag };
      } catch (error) {
        throw mapVercelBlobError(error, pathname);
      }
    },

    async del(pathnames: string[]) {
      if (pathnames.length === 0) return;
      try {
        await del(pathnames, auth);
      } catch (error) {
        if (error instanceof BlobNotFoundError) return;
        throw mapVercelBlobError(error, pathnames.join(","));
      }
    },

    async list(prefix: string) {
      try {
        const pathnames: string[] = [];
        let cursor: string | undefined;
        do {
          const page = await list({ prefix, cursor, limit: 1000, ...auth });
          pathnames.push(...page.blobs.map((b) => b.pathname));
          cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
        return pathnames;
      } catch (error) {
        throw mapVercelBlobError(error, prefix);
      }
    },
  };
}
