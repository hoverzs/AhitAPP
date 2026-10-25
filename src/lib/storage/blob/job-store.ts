import type { JsonBlobClient } from "./client";

export const JOB_BLOB_PREFIX = "jobs/";

export function jobBlobPath(date: string): string {
  return `${JOB_BLOB_PREFIX}${date}.json`;
}

/**
 * A napi generálási feladat állapota (jobs/<dátum>.json). Minden mentés egy
 * összetett művelet — a hívó (generation-job-runner) csak állapotváltáskor ír.
 */
export interface BlobJobStore<T extends { date: string }> {
  get(date: string): Promise<T | null>;
  save(job: T): Promise<void>;
  delete(date: string): Promise<void>;
}

export function createBlobJobStore<T extends { date: string }>(
  client: JsonBlobClient
): BlobJobStore<T> {
  return {
    async get(date) {
      const current = await client.getText(jobBlobPath(date), { fresh: true });
      if (!current) return null;
      try {
        return JSON.parse(current.text) as T;
      } catch {
        return null;
      }
    },

    async save(job) {
      await client.putText(jobBlobPath(job.date), JSON.stringify(job));
    },

    async delete(date) {
      await client.del([jobBlobPath(date)]);
    },
  };
}
