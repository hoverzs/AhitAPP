import type { HistoricalDayEntry } from "../devotional-memory";
import type { Devotional, DevotionalStatus } from "../types";

export interface GetLatestDevotionalsOptions {
  /** Ha nincs megadva, az összes (retention által megtartott) rekord. */
  limit?: number;
}

/**
 * Könnyű admin-sor egy áhítatról (nincs benne a szöveg). A Blob tároló
 * index.json-jában él, ebből épül az admin lista a rekordok olvasása nélkül.
 */
export interface AdminIndexEntry {
  date: string;
  dayNumber: number;
  status: DevotionalStatus;
  title: string;
  verse?: string;
  category?: string;
  generatedAt?: string;
  updatedAt?: string;
  editedByAdmin?: boolean;
  lastApiError?: string;
  /** A kép URL-je (üres, ha nincs) — a törlés a rekord olvasása nélkül tudja, mit töröljön. */
  imageUrl?: string;
}

/** A Blob tároló karbantartott, a rekordok törlése után is megmaradó előzménye. */
export interface StorageMetaSummary {
  maxDayNumber: number;
  usedVerseReferences: string[];
  usedTitles: string[];
  usedCategories: string[];
  recentDays?: HistoricalDayEntry[];
}

export interface StorageRetentionResult {
  referenceDate: string;
  retentionDays: number;
  cutoff: string | null;
  /** Régebbi, de NEM törölhető (nem közzétett) rekordok dátumai. */
  keptUnpublished: string[];
  /** Törlésre jelölt (régi + közzétett) dátumok. */
  removable: string[];
  /** true, ha a törlés ténylegesen megtörtént. */
  deleted: boolean;
  /** A törölt, saját Blob-képek száma (csak törléskor). */
  imagesDeleted: number;
  /** A képtörlés közben elbukott URL-ek (a rekord ettől még törlődött). */
  imagesFailed: string[];
}

export interface DevotionalStorage {
  getLatestDevotionals(options?: GetLatestDevotionalsOptions): Promise<Devotional[]>;
  getDevotionalByDate(date: string): Promise<Devotional | undefined>;
  /** Pontosan a megadott dátumok rekordjai (Redis: egyetlen MGET, index nélkül). */
  getDevotionalsByDates(dates: string[]): Promise<Devotional[]>;
  /**
   * Admin munkakészlet: a minDate-nél nem régebbi (vagy jövőbeli) rekordok
   * + a legnagyobb napszámú rekord (a napszámozáshoz).
   */
  getDevotionalsFromDate(minDate: string): Promise<Devotional[]>;
  saveDevotional(devotional: Devotional): Promise<Devotional>;
  updateDevotional(date: string, devotional: Devotional): Promise<Devotional>;
  deleteDevotional(date: string): Promise<void>;

  /**
   * Opcionális, „lusta" admin-képességek (Blob). Ha jelen vannak, az admin
   * csak a könnyű sorokat tölti be, a teljes rekordot pedig igény szerint.
   */
  listAdminEntries?(minDate: string): Promise<AdminIndexEntry[]>;
  getDevotionalByDayNumber?(dayNumber: number): Promise<Devotional | undefined>;
  getMeta?(): Promise<StorageMetaSummary | null>;
  /** Nyilvános pillanatkép egyetlen olvasással; null, ha még nincs. */
  getPublicWindowDevotionals?(): Promise<Devotional[] | null>;
  /** Napi retention (index-vezérelt). Alapból csak előnézet: törlés csak apply: true esetén. */
  runRetention?(options: { apply: boolean }): Promise<StorageRetentionResult>;
}

export type StorageDriver = "local" | "redis" | "blob";
