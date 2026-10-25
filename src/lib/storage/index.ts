import { isProductionDeployment } from "../cron-env";
import type { DailyGenerationJob } from "../generation-job-types";
import { createBlobStorage } from "./blob/blob-storage";
import type { JsonBlobClient } from "./blob/client";
import {
  BLOB_ACCESS,
  getDataBlobAuth,
  getImagesBlobAuth,
  isBlobStorageConfigured,
  isImageBlobConfigured,
} from "./blob/config";
import type { ImageBlobStore } from "./blob/image-store";
import { createBlobJobStore, type BlobJobStore } from "./blob/job-store";
import { createVercelBlobClient } from "./blob/vercel-client";
import { createVercelImageStore } from "./blob/vercel-image-store";
import { invalidatePublicDevotionalsCache } from "./cache-tags";
import { ProductionStorageNotConfiguredError } from "./errors";
import { localJsonStorage } from "./local-json-storage";
import { isRedisStorageConfigured, redisStorage } from "./redis-storage";
import type { DevotionalStorage, StorageDriver } from "./types";

export type {
  AdminIndexEntry,
  DevotionalStorage,
  StorageDriver,
  GetLatestDevotionalsOptions,
} from "./types";
export { isBlobStorageConfigured, isImageBlobConfigured } from "./blob/config";
export { isOwnedBlobImageUrl } from "./blob/image-store";
export type { ImageBlobStore } from "./blob/image-store";
export {
  ProductionStorageNotConfiguredError,
  StorageBackendError,
  describeStorageReasonHu,
  isAnyStorageError,
  isStorageBackendError,
  storageErrorReason,
  isProductionStorageNotConfiguredError,
  storageErrorMessage,
  storageErrorStatus,
} from "./errors";
export { devotionalDateKey } from "./devotional-validate";
export { LOCAL_DEVOTIONALS_PATH } from "./local-json-storage";
export {
  getRedisRestCredentials,
  isRedisStorageConfigured,
  migrateLocalJsonToRedis,
  runDevotionalRetention,
  REDIS_DEVOTIONAL_DATA_PREFIX,
  REDIS_DEVOTIONAL_INDEX_KEY,
  REDIS_DEVOTIONALS_LEGACY_KEY,
} from "./redis-storage";
export {
  getRetentionCutoffDate,
  getRetentionDays,
  isRetentionAutoDeleteEnabled,
} from "./retention";
export { storageErrorResponse, withStorageErrorFallback } from "./api-error";

/**
 * Meghajtó: STORAGE_DRIVER=local|redis|blob. Kifejezett beállítás nélkül
 * Vercelen/productionben redis, máshol local — a Blob csak a
 * STORAGE_DRIVER=blob beállítással kapcsol be (alapértelmezés nem változik).
 */
export function resolveStorageDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === "local") return "local";
  if (explicit === "blob") return "blob";
  if (explicit === "redis" || explicit === "kv") return "redis";

  if (process.env.VERCEL || isProductionDeployment()) {
    return "redis";
  }

  return "local";
}

export function isRemoteStorageRequired(): boolean {
  return resolveStorageDriver() !== "local";
}

let cachedStorage: DevotionalStorage | null = null;
let cachedBlobClient: JsonBlobClient | null = null;
let cachedJobStore: BlobJobStore<DailyGenerationJob> | null = null;
let loggedDriver: StorageDriver | null = null;

let injectedBlobClient: JsonBlobClient | null = null;
let injectedImageStore: ImageBlobStore | null = null;
let cachedImageStore: ImageBlobStore | null = null;

/** Csak tesztekhez: a Blob-meghajtó egy memóriabeli klienst használ (null: vissza az élesre). */
export function setBlobClientForTesting(client: JsonBlobClient | null): void {
  injectedBlobClient = client;
  resetDevotionalStorageCache();
}

/** Csak tesztekhez: memóriabeli képtár (null: vissza az élesre). */
export function setImageStoreForTesting(store: ImageBlobStore | null): void {
  injectedImageStore = store;
  resetDevotionalStorageCache();
}

function getBlobClient(): JsonBlobClient {
  if (injectedBlobClient) return injectedBlobClient;
  if (!isBlobStorageConfigured()) {
    throw new ProductionStorageNotConfiguredError();
  }
  cachedBlobClient ??= createVercelBlobClient({
    access: BLOB_ACCESS.data,
    ...getDataBlobAuth(),
  });
  return cachedBlobClient;
}

/**
 * A képtár (nyilvános Blob store). null, ha nem a Blob meghajtó fut, vagy a
 * képtár hitelesítése nincs beállítva — ilyenkor a feltöltés nem elérhető.
 */
export function getImageStore(): ImageBlobStore | null {
  if (resolveStorageDriver() !== "blob") return null;
  if (injectedImageStore) return injectedImageStore;
  if (!isImageBlobConfigured()) return null;
  cachedImageStore ??= createVercelImageStore(getImagesBlobAuth());
  return cachedImageStore;
}

/** A napi generálási feladat Blob-tára (csak STORAGE_DRIVER=blob esetén). */
export function getBlobJobStore(): BlobJobStore<DailyGenerationJob> {
  cachedJobStore ??= createBlobJobStore<DailyGenerationJob>(getBlobClient());
  return cachedJobStore;
}

export function getDevotionalStorage(): DevotionalStorage {
  if (cachedStorage) return cachedStorage;

  const driver = resolveStorageDriver();

  if (loggedDriver !== driver) {
    console.info(`[storage] Devotional storage driver: ${driver}`);
    loggedDriver = driver;
  }

  if (driver === "local") {
    cachedStorage = localJsonStorage;
    return cachedStorage;
  }

  if (driver === "blob") {
    cachedStorage = createBlobStorage(getBlobClient(), {
      onChange: invalidatePublicDevotionalsCache,
      images: getImageStore(),
    });
    return cachedStorage;
  }

  if (!isRedisStorageConfigured()) {
    throw new ProductionStorageNotConfiguredError();
  }

  cachedStorage = redisStorage;
  return cachedStorage;
}

/** Tesztekhez / explicit reset */
export function resetDevotionalStorageCache(): void {
  cachedStorage = null;
  cachedBlobClient = null;
  cachedJobStore = null;
  cachedImageStore = null;
}
