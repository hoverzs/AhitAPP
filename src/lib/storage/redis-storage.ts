import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import { normalizeDevotional } from "../devotional-status";
import type { Devotional } from "../types";
import { getBundledDevotionalsForSeed } from "./bundled-seed";
import {
  devotionalDateKey,
  parseDevotionalList,
  sortDevotionals,
} from "./devotional-validate";
import { LOCAL_DEVOTIONALS_PATH } from "./local-json-storage";
import {
  getRetentionCutoffDate,
  getRetentionDays,
  isDateWithinRetention,
} from "./retention";
import type { DevotionalStorage, GetLatestDevotionalsOptions } from "./types";

/** Dátum index — score: dayNumber, member: YYYY-MM-DD */
export const REDIS_DEVOTIONAL_INDEX_KEY = "ahitapp:devotional:index";
export const REDIS_DEVOTIONAL_DATA_PREFIX = "ahitapp:devotional:data:";
/** @deprecated Egyetlen blob — migrálás után törlődik */
export const REDIS_DEVOTIONALS_LEGACY_KEY = "ahitapp:devotionals";

let redisClient: Redis | null | undefined;
let legacyMigrationDone = false;

export function getRedisRestCredentials(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) return null;
  return { url, token };
}

export function isRedisStorageConfigured(): boolean {
  return getRedisRestCredentials() !== null;
}

function getRedisClient(): Redis {
  if (redisClient === undefined) {
    const creds = getRedisRestCredentials();
    redisClient = creds ? new Redis({ url: creds.url, token: creds.token }) : null;
  }
  if (!redisClient) {
    throw new Error("Redis client is not configured.");
  }
  return redisClient;
}

function dataKey(date: string): string {
  return `${REDIS_DEVOTIONAL_DATA_PREFIX}${date}`;
}

function parseStoredDevotional(raw: unknown): Devotional | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const list = parseDevotionalList([raw]);
  return list[0];
}

async function writeDevotionalRecord(
  redis: Redis,
  devotional: Devotional
): Promise<void> {
  const normalized = normalizeDevotional(devotional);
  const date = devotionalDateKey(normalized);
  await redis.set(dataKey(date), normalized);
  await redis.zadd(REDIS_DEVOTIONAL_INDEX_KEY, {
    score: normalized.dayNumber,
    member: date,
  });
}

async function applyRetention(redis: Redis): Promise<number> {
  const cutoff = getRetentionCutoffDate();
  if (!cutoff) return 0;

  const allDates = await redis.zrange<string[]>(REDIS_DEVOTIONAL_INDEX_KEY, 0, -1);
  const toDelete = allDates.filter((date) => !isDateWithinRetention(date));

  if (toDelete.length === 0) return 0;

  await redis.zrem(REDIS_DEVOTIONAL_INDEX_KEY, ...toDelete);
  await redis.del(...toDelete.map(dataKey));

  console.info(
    `[redisStorage] Retention (${getRetentionDays()} nap): ${toDelete.length} régi áhítat törölve (cutoff: ${cutoff}).`
  );
  return toDelete.length;
}

async function migrateLegacyBlob(redis: Redis): Promise<void> {
  const legacy = await redis.get<unknown>(REDIS_DEVOTIONALS_LEGACY_KEY);
  if (legacy == null) return;

  const list = parseDevotionalList(legacy);
  for (const d of list) {
    await writeDevotionalRecord(redis, d);
  }
  await redis.del(REDIS_DEVOTIONALS_LEGACY_KEY);
  console.info(
    `[redisStorage] Legacy blob migrálva: ${list.length} áhítat → dátum kulcsok.`
  );
}

async function loadSeedDevotionals(): Promise<Devotional[]> {
  const bundled = getBundledDevotionalsForSeed();
  if (bundled.length > 0) return bundled;

  try {
    const raw = await fs.readFile(LOCAL_DEVOTIONALS_PATH, "utf-8");
    return parseDevotionalList(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function seedFromBundledJson(redis: Redis): Promise<number> {
  try {
    const parsed = await loadSeedDevotionals();
    if (parsed.length === 0) return 0;

    for (const d of parsed) {
      const date = devotionalDateKey(d);
      const existing = await redis.get(dataKey(date));
      if (existing == null) {
        await writeDevotionalRecord(redis, d);
      }
    }

    await applyRetention(redis);
    console.info(
      `[redisStorage] Seed: ${parsed.length} áhítat betöltve bundled JSON-ból.`
    );
    return parsed.length;
  } catch (error) {
    console.error("[redisStorage] Seed failed:", error);
    return 0;
  }
}

async function ensureRedisReady(redis: Redis): Promise<void> {
  if (legacyMigrationDone) return;

  await migrateLegacyBlob(redis);

  const indexSize = await redis.zcard(REDIS_DEVOTIONAL_INDEX_KEY);
  if (indexSize === 0) {
    await seedFromBundledJson(redis);
  }

  legacyMigrationDone = true;
}

async function readLatestFromRedis(
  options?: GetLatestDevotionalsOptions
): Promise<Devotional[]> {
  const redis = getRedisClient();
  await ensureRedisReady(redis);

  const end = options?.limit != null ? options.limit - 1 : -1;
  const dates = await redis.zrange<string[]>(
    REDIS_DEVOTIONAL_INDEX_KEY,
    0,
    end,
    { rev: true }
  );

  if (dates.length === 0) return [];

  const records = await redis.mget<(Devotional | null)[]>(
    ...dates.map(dataKey)
  );

  const devotionals: Devotional[] = [];
  for (let i = 0; i < dates.length; i++) {
    const parsed = parseStoredDevotional(records[i]);
    if (parsed) devotionals.push(parsed);
  }

  return devotionals.sort((a, b) => b.dayNumber - a.dayNumber);
}

export const redisStorage: DevotionalStorage = {
  async getLatestDevotionals(options) {
    return readLatestFromRedis(options);
  },

  async getDevotionalByDate(date: string) {
    const redis = getRedisClient();
    await ensureRedisReady(redis);
    const raw = await redis.get<unknown>(dataKey(date));
    return parseStoredDevotional(raw);
  },

  async saveDevotional(devotional: Devotional) {
    const redis = getRedisClient();
    await ensureRedisReady(redis);

    const normalized = normalizeDevotional(devotional);
    const date = devotionalDateKey(normalized);

    const existingByDate = await redis.get(dataKey(date));
    if (existingByDate != null) {
      throw new Error(`Erre a napra (${date}) már van áhítat.`);
    }

    const all = await readLatestFromRedis();
    if (all.some((d) => d.dayNumber === normalized.dayNumber)) {
      throw new Error(`A ${normalized.dayNumber}. nap már létezik.`);
    }

    await writeDevotionalRecord(redis, normalized);
    await applyRetention(redis);
    return normalized;
  },

  async updateDevotional(date: string, devotional: Devotional) {
    const redis = getRedisClient();
    await ensureRedisReady(redis);

    const normalized = normalizeDevotional(devotional);
    const existing = await redis.get(dataKey(date));
    if (existing == null) {
      throw new Error(`Nincs áhítat erre a napra: ${date}.`);
    }

    const newDate = devotionalDateKey(normalized);
    if (newDate !== date) {
      await redis.del(dataKey(date));
      await redis.zrem(REDIS_DEVOTIONAL_INDEX_KEY, date);
      await writeDevotionalRecord(redis, normalized);
    } else {
      await redis.set(dataKey(date), normalized);
      await redis.zadd(REDIS_DEVOTIONAL_INDEX_KEY, {
        score: normalized.dayNumber,
        member: date,
      });
    }

    await applyRetention(redis);
    return normalized;
  },

  async deleteDevotional(date: string) {
    const redis = getRedisClient();
    await ensureRedisReady(redis);

    const removed = await redis.zrem(REDIS_DEVOTIONAL_INDEX_KEY, date);
    if (removed === 0) {
      throw new Error(`Nincs áhítat erre a napra: ${date}.`);
    }
    await redis.del(dataKey(date));
  },
};

/** Lokális JSON → Redis (dátum kulcsok). */
export async function migrateLocalJsonToRedis(): Promise<number> {
  const redis = getRedisClient();
  legacyMigrationDone = false;

  const parsed = await loadSeedDevotionals();
  if (parsed.length === 0) return 0;

  for (const d of sortDevotionals(parsed)) {
    await writeDevotionalRecord(redis, d);
  }
  await applyRetention(redis);
  legacyMigrationDone = true;
  return parsed.length;
}
