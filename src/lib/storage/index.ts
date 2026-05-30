import { isProductionDeployment } from "../cron-env";
import { ProductionStorageNotConfiguredError } from "./errors";
import { localJsonStorage } from "./local-json-storage";
import { isRedisStorageConfigured, redisStorage } from "./redis-storage";
import type { DevotionalStorage, StorageDriver } from "./types";

export type { DevotionalStorage, StorageDriver } from "./types";
export {
  ProductionStorageNotConfiguredError,
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
  REDIS_DEVOTIONAL_DATA_PREFIX,
  REDIS_DEVOTIONAL_INDEX_KEY,
  REDIS_DEVOTIONALS_LEGACY_KEY,
} from "./redis-storage";
export { getRetentionCutoffDate, getRetentionDays } from "./retention";
export type { GetLatestDevotionalsOptions } from "./types";
export { storageErrorResponse, withStorageErrorFallback } from "./api-error";

/**
 * Storage driver feloldás:
 * - STORAGE_DRIVER=local → JSON fájl (fejlesztés)
 * - STORAGE_DRIVER=redis → Upstash / Vercel KV Redis
 * - Vercel deploy (VERCEL=1) → Redis kötelező
 * - egyéb → local JSON
 */
export function resolveStorageDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === "local") return "local";
  if (explicit === "redis" || explicit === "kv") return "redis";

  if (process.env.VERCEL || isProductionDeployment()) {
    return "redis";
  }

  return "local";
}

export function isRemoteStorageRequired(): boolean {
  return resolveStorageDriver() === "redis";
}

let cachedStorage: DevotionalStorage | null = null;
let loggedDriver: StorageDriver | null = null;

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

  if (!isRedisStorageConfigured()) {
    throw new ProductionStorageNotConfiguredError();
  }

  cachedStorage = redisStorage;
  return cachedStorage;
}

/** Tesztekhez / explicit reset */
export function resetDevotionalStorageCache(): void {
  cachedStorage = null;
}
