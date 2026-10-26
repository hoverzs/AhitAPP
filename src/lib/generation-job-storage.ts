import { promises as fs } from "fs";
import path from "path";
import type { Redis } from "@upstash/redis";
import { createRedisClient } from "./storage/redis-client";
import {
  getRedisRestCredentials,
  isRedisStorageConfigured,
  REDIS_GENERATION_JOB_PREFIX,
} from "./storage/redis-storage";
import { getBlobJobStore, resolveStorageDriver } from "./storage";
import { getLocalDataDir } from "./storage/local-data-dir";
import {
  normalizeGenerationJob,
  type DailyGenerationJob,
} from "./generation-job-types";

export { REDIS_GENERATION_JOB_PREFIX };

const LOCAL_JOBS_PATH = path.join(getLocalDataDir(), "generation-jobs.json");

function jobRedisKey(date: string): string {
  return `${REDIS_GENERATION_JOB_PREFIX}${date}`;
}

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient === undefined) {
    const creds = getRedisRestCredentials();
    redisClient = creds ? createRedisClient(creds.url, creds.token) : null;
  }
  return redisClient;
}

function shouldPersistJobsInRedis(): boolean {
  const driver = resolveStorageDriver();
  return driver === "redis" && isRedisStorageConfigured();
}

function shouldPersistJobsInBlob(): boolean {
  return resolveStorageDriver() === "blob";
}

async function readLocalJobsFile(): Promise<Record<string, DailyGenerationJob>> {
  try {
    const raw = await fs.readFile(LOCAL_JOBS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, DailyGenerationJob>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[generation-job-storage] read error:", error);
    }
    return {};
  }
}

async function writeLocalJobsFile(
  jobs: Record<string, DailyGenerationJob>
): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_JOBS_PATH), { recursive: true });
  await fs.writeFile(LOCAL_JOBS_PATH, JSON.stringify(jobs, null, 2), "utf-8");
}

export async function getGenerationJob(
  date: string
): Promise<DailyGenerationJob | null> {
  if (shouldPersistJobsInBlob()) {
    const job = await getBlobJobStore().get(date);
    return job ? normalizeGenerationJob(job) : null;
  }

  if (shouldPersistJobsInRedis()) {
    const redis = getRedisClient();
    if (!redis) return null;
    const raw = await redis.get<DailyGenerationJob>(jobRedisKey(date));
    return raw ? normalizeGenerationJob(raw) : null;
  }

  const all = await readLocalJobsFile();
  const job = all[date];
  return job ? normalizeGenerationJob(job) : null;
}

export async function saveGenerationJob(job: DailyGenerationJob): Promise<void> {
  if (shouldPersistJobsInBlob()) {
    await getBlobJobStore().save(job);
    return;
  }

  if (shouldPersistJobsInRedis()) {
    const redis = getRedisClient();
    if (!redis) {
      throw new Error("Redis nincs konfigurálva a generálási feladathoz.");
    }
    await redis.set(jobRedisKey(job.date), job);
    return;
  }

  const all = await readLocalJobsFile();
  all[job.date] = job;
  await writeLocalJobsFile(all);
}

export async function deleteGenerationJob(date: string): Promise<void> {
  if (shouldPersistJobsInBlob()) {
    await getBlobJobStore().delete(date);
    return;
  }

  if (shouldPersistJobsInRedis()) {
    const redis = getRedisClient();
    if (redis) {
      await redis.del(jobRedisKey(date));
    }
    return;
  }

  const all = await readLocalJobsFile();
  delete all[date];
  await writeLocalJobsFile(all);
}
