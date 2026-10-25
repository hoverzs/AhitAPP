import type { Redis } from "@upstash/redis";
import { createRedisClient } from "./redis-client";
import { promises as fs } from "fs";
import {
  normalizeDevotional,
  normalizeDevotionalStatus,
} from "../devotional-status";
import type { Devotional } from "../types";
import { getBundledDevotionalsForSeed } from "./bundled-seed";
import {
  devotionalDateKey,
  parseDevotionalList,
  sortDevotionals,
} from "./devotional-validate";
import { LOCAL_DEVOTIONALS_PATH } from "./local-json-storage";
import { invalidatePublicDevotionalsCache } from "./cache-tags";
import { planRetention } from "./retention";
import type { DevotionalStorage, GetLatestDevotionalsOptions } from "./types";

/** Dátum index — score: a nap sorszáma az epocha óta (dátum szerinti rendezés), member: YYYY-MM-DD */
export const REDIS_DEVOTIONAL_INDEX_KEY = "ahitapp:devotional:index";
export const REDIS_DEVOTIONAL_DATA_PREFIX = "ahitapp:devotional:data:";
/** @deprecated Egyetlen blob — migrálás után törlődik */
export const REDIS_DEVOTIONALS_LEGACY_KEY = "ahitapp:devotionals";
/** Napi generálási feladat kulcs-előtag (generation-job-storage.ts) */
export const REDIS_GENERATION_JOB_PREFIX = "ahitapp:generation:job:";

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
    redisClient = creds ? createRedisClient(creds.url, creds.token) : null;
  }
  if (!redisClient) {
    throw new Error("Redis client is not configured.");
  }
  return redisClient;
}

/** A dátum rendezési értéke az indexben (nincs napszámozás). */
function dateScore(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : 0;
}

function sortNewestFirst(list: Devotional[]): Devotional[] {
  return list.sort((a, b) => devotionalDateKey(b).localeCompare(devotionalDateKey(a)));
}

function dataKey(date: string): string {
  return `${REDIS_DEVOTIONAL_DATA_PREFIX}${date}`;
}

/**
 * Átmeneti Redis-hiba (rate limit / hálózat / timeout)? Ezeknél érdemes
 * újrapróbálni, NEHOGY egy pillanatnyi blip miatt üresnek tűnjön a tároló és
 * a főoldal kiürüljön.
 */
function isTransientRedisError(error: unknown): boolean {
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("timeout")
  );
}

/** Olvasási műveletek köré: átmeneti hibánál néhány gyors újrapróba. */
async function withRedisRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientRedisError(error) || attempt === attempts) {
        throw error;
      }
      const delayMs = 150 * attempt;
      console.warn(
        `[redisStorage] átmeneti hiba (${label}), újrapróba ${attempt}/${attempts - 1} ${delayMs}ms múlva:`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
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
    score: dateScore(date),
    member: date,
  });
}

export interface RetentionRunResult {
  referenceDate: string;
  retentionDays: number;
  cutoff: string | null;
  /** Régebbi, de NEM törölhető (nem közzétett) rekordok dátumai */
  keptUnpublished: string[];
  /** Törlésre jelölt (régi + közzétett) dátumok */
  removable: string[];
  /** true, ha a törlés ténylegesen megtörtént */
  deleted: boolean;
}

/**
 * Napi ütemezett retention (cron). Alapból csak előnézet; törlés csak ha
 * `apply` igaz. Csak a KÖZZÉTETT, cutoff-nál régebbi áhítatot törli az áhítat
 * dátuma alapján — piszkozat / jóváhagyott / jövőbeli és a legfrissebb
 * rekord megmarad. Csak saját névtér: index tag + data kulcs + generálási
 * feladat kulcs.
 */
export async function runDevotionalRetention(options: {
  apply: boolean;
}): Promise<RetentionRunResult> {
  const redis = getRedisClient();
  const plan = planRetention(
    await redis.zrange<string[]>(REDIS_DEVOTIONAL_INDEX_KEY, 0, -1)
  );
  const result: RetentionRunResult = {
    referenceDate: plan.referenceDate,
    retentionDays: plan.retentionDays,
    cutoff: plan.cutoff,
    keptUnpublished: [],
    removable: [],
    deleted: false,
  };
  if (plan.remove.length === 0) return result;

  const records = await redis.mget<unknown[]>(...plan.remove.map(dataKey));
  plan.remove.forEach((date, i) => {
    const parsed = parseStoredDevotional(records[i]);
    // Hiányzó / nem olvasható rekordnál csak az árva index-tagot takarítjuk.
    if (!parsed || normalizeDevotionalStatus(parsed.status) === "published") {
      result.removable.push(date);
    } else {
      result.keptUnpublished.push(date);
    }
  });

  if (!options.apply || result.removable.length === 0) return result;

  await redis.zrem(REDIS_DEVOTIONAL_INDEX_KEY, ...result.removable);
  await redis.del(
    ...result.removable.map(dataKey),
    ...result.removable.map((d) => `${REDIS_GENERATION_JOB_PREFIX}${d}`)
  );
  invalidateSnapshot();
  result.deleted = true;
  console.info(
    `[redisStorage] Retention (${plan.retentionDays} nap): ${result.removable.length} régi, közzétett áhítat törölve (cutoff: ${plan.cutoff}).`
  );
  return result;
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

  // Hideg indításonként egyetlen parancs (ZCARD). A legacy blob-migráció és a
  // seed csak üres indexnél kell; a legacy kulcs migrálás után törlődik.
  let indexSize = await redis.zcard(REDIS_DEVOTIONAL_INDEX_KEY);
  if (indexSize === 0) {
    await migrateLegacyBlob(redis);
    indexSize = await redis.zcard(REDIS_DEVOTIONAL_INDEX_KEY);
    if (indexSize === 0) {
      await seedFromBundledJson(redis);
    }
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

  return sortNewestFirst(devotionals);
}

/**
 * Folyamaton belüli pillanatkép a teljes listáról. Egy oldalmegjelenítés
 * (layout + oldal + metadata) több helyen olvassa ugyanazt a listát; ez
 * csökkenti a Redis-parancsok számát, és ha a Redis elérhetetlen (kvóta,
 * hálózat), az utolsó ismert jó állapotot adjuk vissza üres oldal helyett.
 */
const SNAPSHOT_TTL_MS = 10_000;
let snapshot: { at: number; list: Devotional[] } | null = null;

function invalidateSnapshot(): void {
  snapshot = null;
  invalidatePublicDevotionalsCache();
}

async function readAllWithSnapshot(): Promise<Devotional[]> {
  if (snapshot && Date.now() - snapshot.at < SNAPSHOT_TTL_MS) {
    return snapshot.list;
  }
  try {
    const list = await withRedisRetry("getLatestDevotionals", () =>
      readLatestFromRedis()
    );
    snapshot = { at: Date.now(), list };
    return list;
  } catch (error) {
    if (snapshot) {
      console.error(
        "[redisStorage] Redis olvasás sikertelen, az utolsó ismert állapotot használom:",
        error
      );
      return snapshot.list;
    }
    throw error;
  }
}

export const redisStorage: DevotionalStorage = {
  async getLatestDevotionals(options) {
    const list = await readAllWithSnapshot();
    return options?.limit != null ? list.slice(0, options.limit) : list;
  },

  async getDevotionalByDate(date: string) {
    try {
      return await withRedisRetry(`getDevotionalByDate(${date})`, async () => {
        const redis = getRedisClient();
        await ensureRedisReady(redis);
        const raw = await redis.get<unknown>(dataKey(date));
        return parseStoredDevotional(raw);
      });
    } catch (error) {
      const stale = snapshot?.list.find((d) => devotionalDateKey(d) === date);
      if (stale) {
        console.error(
          `[redisStorage] getDevotionalByDate(${date}) sikertelen, pillanatkép használata:`,
          error
        );
        return stale;
      }
      throw error;
    }
  },

  async getDevotionalsByDates(dates: string[]) {
    if (dates.length === 0) return [];
    // Nyilvános olvasás: egyetlen MGET, nincs index- vagy init-parancs.
    return withRedisRetry("getDevotionalsByDates", async () => {
      const redis = getRedisClient();
      const records = await redis.mget<unknown[]>(...dates.map(dataKey));
      const list: Devotional[] = [];
      for (const raw of records) {
        const parsed = parseStoredDevotional(raw);
        if (parsed) list.push(parsed);
      }
      return sortNewestFirst(list);
    });
  },

  async getDevotionalsFromDate(minDate: string) {
    return withRedisRetry("getDevotionalsFromDate", async () => {
      const redis = getRedisClient();
      await ensureRedisReady(redis);
      const all = await redis.zrange<string[]>(REDIS_DEVOTIONAL_INDEX_KEY, 0, -1);
      const dates = all.map(String).filter((date) => date >= minDate);
      if (dates.length === 0) return [];
      const records = await redis.mget<unknown[]>(...dates.map(dataKey));
      const list: Devotional[] = [];
      for (const raw of records) {
        const parsed = parseStoredDevotional(raw);
        if (parsed) list.push(parsed);
      }
      return sortNewestFirst(list);
    });
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

    await writeDevotionalRecord(redis, normalized);
    invalidateSnapshot();
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
        score: dateScore(date),
        member: date,
      });
    }
    invalidateSnapshot();
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
    invalidateSnapshot();
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
  legacyMigrationDone = true;
  invalidateSnapshot();
  return parsed.length;
}
