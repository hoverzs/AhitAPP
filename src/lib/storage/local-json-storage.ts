import { promises as fs } from "fs";
import path from "path";
import { normalizeDevotional } from "../devotional-status";
import type { Devotional } from "../types";
import {
  devotionalDateKey,
  parseDevotionalList,
  sortDevotionals,
} from "./devotional-validate";
import type { DevotionalStorage, GetLatestDevotionalsOptions } from "./types";

export const LOCAL_DEVOTIONALS_PATH = path.join(
  process.cwd(),
  "data",
  "devotionals.json"
);

async function readRawFromFile(): Promise<Devotional[]> {
  try {
    const raw = await fs.readFile(LOCAL_DEVOTIONALS_PATH, "utf-8");
    return parseDevotionalList(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[localJsonStorage] read error:", error);
    }
    return [];
  }
}

async function writeRawToFile(devotionals: Devotional[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_DEVOTIONALS_PATH), { recursive: true });
  await fs.writeFile(
    LOCAL_DEVOTIONALS_PATH,
    JSON.stringify(sortDevotionals(devotionals), null, 2),
    "utf-8"
  );
}

function latestFirst(all: Devotional[], limit?: number): Devotional[] {
  const sorted = [...all].sort((a, b) => b.dayNumber - a.dayNumber);
  if (limit != null && limit > 0) {
    return sorted.slice(0, limit);
  }
  return sorted;
}

export const localJsonStorage: DevotionalStorage = {
  async getLatestDevotionals(options?: GetLatestDevotionalsOptions) {
    return latestFirst(await readRawFromFile(), options?.limit);
  },

  async getDevotionalByDate(date: string) {
    const all = await readRawFromFile();
    return all.find((d) => devotionalDateKey(d) === date);
  },

  async saveDevotional(devotional: Devotional) {
    const normalized = normalizeDevotional(devotional);
    const all = await readRawFromFile();
    const date = devotionalDateKey(normalized);

    if (all.some((d) => devotionalDateKey(d) === date)) {
      throw new Error(`Erre a napra (${date}) már van áhítat.`);
    }
    if (all.some((d) => d.dayNumber === normalized.dayNumber)) {
      throw new Error(`A ${normalized.dayNumber}. nap már létezik.`);
    }

    all.push(normalized);
    await writeRawToFile(all);
    return normalized;
  },

  async updateDevotional(date: string, devotional: Devotional) {
    const normalized = normalizeDevotional(devotional);
    const all = await readRawFromFile();
    const idx = all.findIndex((d) => devotionalDateKey(d) === date);

    if (idx < 0) {
      throw new Error(`Nincs áhítat erre a napra: ${date}.`);
    }

    all[idx] = normalized;
    await writeRawToFile(all);
    return normalized;
  },

  async deleteDevotional(date: string) {
    const all = await readRawFromFile();
    const next = all.filter((d) => devotionalDateKey(d) !== date);
    if (next.length === all.length) {
      throw new Error(`Nincs áhítat erre a napra: ${date}.`);
    }
    await writeRawToFile(next);
  },
};
