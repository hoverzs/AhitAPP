import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import {
  getRedisRestCredentials,
  isRedisStorageConfigured,
} from "./storage/redis-storage";
import { resolveStorageDriver } from "./storage";
import type { DailyGenerationJob } from "./generation-job-types";

export const REDIS_GENERATION_JOB_PREFIX = "ahitapp:generation:job:";

const LOCAL_JOBS_PATH = path.join(process.cwd(), "data", "generation-jobs.json");

function jobRedisKey(date: string): string {
  return `${REDIS_GENERATION_JOB_PREFIX}${date}`;
}

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient === undefined) {
    const creds = getRedisRestCredentials();
    redisClient = creds ? new Redis({ url: creds.url, token: creds.token }) : null;
  }
  return redisClient;
}

function shouldPersistJobsInRedis(): boolean {
  const driver = resolveStorageDriver();
  return driver === "redis" && isRedisStorageConfigured();
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
  if (shouldPersistJobsInRedis()) {
    const redis = getRedisClient();
    if (!redis) return null;
    const raw = await redis.get<DailyGenerationJob>(jobRedisKey(date));
    return raw ?? null;
  }

  const all = await readLocalJobsFile();
  return all[date] ?? null;
}

export async function saveGenerationJob(job: DailyGenerationJob): Promise<void> {
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
