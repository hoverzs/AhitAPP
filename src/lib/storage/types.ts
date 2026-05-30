import type { Devotional } from "../types";

export interface GetLatestDevotionalsOptions {
  /** Ha nincs megadva, az összes (retention által megtartott) rekord. */
  limit?: number;
}

export interface DevotionalStorage {
  getLatestDevotionals(options?: GetLatestDevotionalsOptions): Promise<Devotional[]>;
  getDevotionalByDate(date: string): Promise<Devotional | undefined>;
  saveDevotional(devotional: Devotional): Promise<Devotional>;
  updateDevotional(date: string, devotional: Devotional): Promise<Devotional>;
  deleteDevotional(date: string): Promise<void>;
}

export type StorageDriver = "local" | "redis";
