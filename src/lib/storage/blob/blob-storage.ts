import { addDaysToIsoDate, getAppTodayIso } from "../../app-date";
import {
  extractVerseReference,
  type HistoricalDayEntry,
} from "../../devotional-memory";
import {
  normalizeDevotional,
  normalizeDevotionalStatus,
} from "../../devotional-status";
import { PUBLIC_PAST_DAYS } from "../../public-window";
import type { Devotional } from "../../types";
import { devotionalDateKey, parseDevotionalList } from "../devotional-validate";
import { planRetention } from "../retention";
import type {
  AdminIndexEntry,
  DevotionalStorage,
  GetLatestDevotionalsOptions,
  StorageRetentionResult,
} from "../types";
import {
  BlobAlreadyExistsError,
  BlobPreconditionError,
  type JsonBlobClient,
} from "./client";
import { isOwnedBlobImageUrl, type ImageBlobStore } from "./image-store";
import { jobBlobPath } from "./job-store";

/** Blob-útvonalak a privát store-ban. */
export const BLOB_PATHS = {
  recordPrefix: "devotionals/",
  record: (date: string) => `devotionals/${date}.json`,
  index: "index.json",
  publicWindow: "public-window.json",
  meta: "meta.json",
} as const;

const MAX_CONFLICT_RETRIES = 8;
const DEFAULT_CONFLICT_BACKOFF_MS = 25;

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
const RECENT_DAYS_LIMIT = 21;

export type IndexEntry = AdminIndexEntry;

interface IndexDoc {
  version: 1;
  entries: IndexEntry[];
}

interface WindowDoc {
  version: 1;
  devotionals: Devotional[];
}

/**
 * A rekordok törlése után is megmaradó, kis előzmény a generálás
 * ismétlés-védelméhez (devotional-memory.ts). Napszámot nem tárol.
 */
export interface StorageMeta {
  version: 1;
  usedVerseReferences: string[];
  usedTitles: string[];
  usedCategories: string[];
  recentDays: HistoricalDayEntry[];
}

/** A metába beolvasztható külső előzmény (minden mező opcionális). */
export interface MetaExtra {
  usedVerseReferences?: string[];
  usedTitles?: string[];
  usedCategories?: string[];
  recentDays?: HistoricalDayEntry[];
}

export interface BlobStorageOptions {
  /** Mai nap (YYYY-MM-DD) — tesztekben injektálható. */
  today?: () => string;
  /** Minden sikeres írás (mentés / módosítás / törlés / újraépítés) után hívódik. */
  onChange?: () => void;
  /** A képtár (nyilvános store): retention törléskor innen törlődnek a saját képek. */
  images?: ImageBlobStore | null;
  /** Ütközés utáni újrapróba várakozásának alapja (ms). Alapértelmezés: 25. */
  conflictBackoffMs?: number;
}

export interface BlobDevotionalStorage extends DevotionalStorage {
  /**
   * A nyilvános pillanatkép: közzétett, mai vagy korábbi, ablakon belüli
   * áhítatok (újabb elöl). null, ha a pillanatkép még nem létezik.
   * Pontosan egy olvasás, írás nélkül.
   */
  getPublicWindowDevotionals(): Promise<Devotional[] | null>;
  getMeta(): Promise<StorageMeta | null>;
  listAdminEntries(minDate: string): Promise<AdminIndexEntry[]>;
  runRetention(options: { apply: boolean }): Promise<StorageRetentionResult>;
  mergeMeta(extra: MetaExtra): Promise<StorageMeta>;
  /**
   * Karbantartás: az index, a pillanatkép és a meta újraépítése a rekordokból
   * (egyetlen `list` + olvasások). Részleges írási hiba után használható.
   */
  rebuild(): Promise<{ records: number }>;
  rebuildPublicWindow(): Promise<{ devotionals: number }>;
}

function emptyIndex(): IndexDoc {
  return { version: 1, entries: [] };
}

function emptyWindow(): WindowDoc {
  return { version: 1, devotionals: [] };
}

function emptyMeta(): StorageMeta {
  return {
    version: 1,
    usedVerseReferences: [],
    usedTitles: [],
    usedCategories: [],
    recentDays: [],
  };
}

const INDEX_ERROR_MAX_CHARS = 200;

function toIndexEntry(d: Devotional): IndexEntry {
  return {
    date: devotionalDateKey(d),
    status: normalizeDevotionalStatus(d.status),
    title: d.title,
    verse: d.verse,
    category: d.category,
    generatedAt: d.generatedAt,
    updatedAt: d.updatedAt,
    editedByAdmin: d.editedByAdmin,
    lastApiError: d.lastApiError?.slice(0, INDEX_ERROR_MAX_CHARS),
    imageUrl: d.imageUrl ?? "",
  };
}

/** A nyilvános pillanatkép rekordja: belső / nagy mezők nélkül. */
function toPublicRecord(d: Devotional): Devotional {
  const { versionHistory: _history, lastApiError: _error, ...rest } = d;
  void _history;
  void _error;
  return rest;
}

function parseRecord(text: string): Devotional | undefined {
  try {
    return parseDevotionalList([JSON.parse(text)])[0];
  } catch {
    return undefined;
  }
}

function parseJson<T>(text: string, fallback: () => T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback();
  }
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionError || error instanceof BlobAlreadyExistsError
  );
}

export function createBlobStorage(
  client: JsonBlobClient,
  options: BlobStorageOptions = {}
): BlobDevotionalStorage {
  const today = options.today ?? (() => getAppTodayIso());
  const backoffMs = options.conflictBackoffMs ?? DEFAULT_CONFLICT_BACKOFF_MS;
  const windowCutoff = () => addDaysToIsoDate(today(), -PUBLIC_PAST_DAYS);

  /**
   * Olvasás–módosítás–írás optimista zárolással (ifMatch). Ütközésnél újraolvas
   * és újrapróbál; a dokumentum hiányát `existed: false` jelzi a módosítónak.
   */
  async function mutateJson<T>(
    pathname: string,
    empty: () => T,
    mutate: (doc: T, existed: boolean) => T | void
  ): Promise<{ doc: T; existed: boolean }> {
    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
      const current = await client.getText(pathname, { fresh: true });
      const base = current ? parseJson(current.text, empty) : empty();
      const next = (mutate(base, Boolean(current)) ?? base) as T;
      try {
        await client.putText(
          pathname,
          JSON.stringify(next),
          current ? { ifMatch: current.etag } : { overwrite: false }
        );
        return { doc: next, existed: Boolean(current) };
      } catch (error) {
        if (!isConflict(error)) throw error;
        // Ütközés: rövid, véletlenszerű várakozás, hogy az egyidejű írók ne
        // ugyanabban a pillanatban próbálkozzanak újra (kiéheztetés ellen).
        await sleep(Math.random() * backoffMs * (attempt + 1));
      }
    }
    throw new Error(`Egyidejű módosítás miatt nem sikerült menteni: ${pathname}`);
  }

  async function readIndex(fresh = false): Promise<IndexDoc> {
    const current = await client.getText(BLOB_PATHS.index, { fresh });
    return current ? parseJson(current.text, emptyIndex) : emptyIndex();
  }

  function sortEntries(entries: IndexEntry[]): IndexEntry[] {
    return [...entries].sort((a, b) => b.date.localeCompare(a.date));
  }

  async function upsertIndexEntry(entry: IndexEntry, removeDate?: string) {
    await mutateJson(BLOB_PATHS.index, emptyIndex, (doc) => {
      doc.entries = sortEntries([
        ...doc.entries.filter((e) => e.date !== entry.date && e.date !== removeDate),
        entry,
      ]);
    });
  }

  async function removeIndexEntry(date: string) {
    await mutateJson(BLOB_PATHS.index, emptyIndex, (doc) => {
      doc.entries = doc.entries.filter((e) => e.date !== date);
    });
  }

  async function readRecord(
    date: string,
    fresh = false
  ): Promise<{ devotional: Devotional; etag: string } | undefined> {
    const current = await client.getText(BLOB_PATHS.record(date), { fresh });
    if (!current) return undefined;
    const devotional = parseRecord(current.text);
    return devotional ? { devotional, etag: current.etag } : undefined;
  }

  async function readRecords(dates: string[], fresh = false): Promise<Devotional[]> {
    const rows = await Promise.all(dates.map((d) => readRecord(d, fresh)));
    return rows
      .filter((r): r is { devotional: Devotional; etag: string } => Boolean(r))
      .map((r) => r.devotional)
      .sort((a, b) => devotionalDateKey(b).localeCompare(devotionalDateKey(a)));
  }

  function belongsInWindow(d: Devotional): boolean {
    return (
      normalizeDevotionalStatus(d.status) === "published" &&
      Boolean(d.content?.trim()) &&
      devotionalDateKey(d) >= windowCutoff()
    );
  }

  async function writeWindow(devotionals: Devotional[]): Promise<void> {
    const doc: WindowDoc = {
      version: 1,
      devotionals: devotionals
        .filter(belongsInWindow)
        .map(toPublicRecord)
        .sort((a, b) => devotionalDateKey(b).localeCompare(devotionalDateKey(a))),
    };
    await client.putText(BLOB_PATHS.publicWindow, JSON.stringify(doc));
  }

  async function rebuildPublicWindow(): Promise<{ devotionals: number }> {
    const index = await readIndex(true);
    const cutoff = windowCutoff();
    const dates = index.entries
      .filter((e) => e.status === "published" && e.date >= cutoff)
      .map((e) => e.date);
    const records = await readRecords(dates, true);
    await writeWindow(records);
    return { devotionals: records.filter(belongsInWindow).length };
  }

  /**
   * Egy nap változását vezeti át a pillanatképen: eltávolítja a régi állapotot,
   * és ha az áhítat közzétett és az ablakba esik, beteszi. Hiányzó
   * pillanatképnél teljes újraépítés történik.
   */
  async function applyToWindow(date: string, devotional: Devotional | null) {
    let missing = false;
    await mutateJson(BLOB_PATHS.publicWindow, emptyWindow, (doc, existed) => {
      if (!existed) missing = true;
      const cutoff = windowCutoff();
      const kept = doc.devotionals.filter(
        (d) => devotionalDateKey(d) !== date && devotionalDateKey(d) >= cutoff
      );
      if (devotional && belongsInWindow(devotional)) {
        kept.push(toPublicRecord(devotional));
      }
      doc.devotionals = kept.sort((a, b) =>
        devotionalDateKey(b).localeCompare(devotionalDateKey(a))
      );
    });
    if (missing) await rebuildPublicWindow();
  }

  function addToMeta(meta: StorageMeta, d: Devotional): StorageMeta {
    const verseRef = extractVerseReference(d.verse);
    const unique = (list: string[], value: string | undefined) =>
      value && value.trim() && !list.includes(value) ? [...list, value] : list;

    const day: HistoricalDayEntry = {
      date: devotionalDateKey(d),
      title: d.title,
      verseReference: verseRef,
      category: d.category ?? "—",
    };

    return {
      version: 1,
      usedVerseReferences: unique(meta.usedVerseReferences, verseRef),
      usedTitles: unique(meta.usedTitles, d.title),
      usedCategories: unique(meta.usedCategories, d.category),
      recentDays: [...meta.recentDays.filter((r) => r.date !== day.date), day]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-RECENT_DAYS_LIMIT),
    };
  }

  async function applyToMeta(d: Devotional) {
    await mutateJson(BLOB_PATHS.meta, emptyMeta, (meta) => addToMeta(meta, d));
  }

  async function putRecord(
    date: string,
    devotional: Devotional,
    mode: { create: true } | { ifMatch: string }
  ) {
    const text = JSON.stringify(devotional);
    if ("create" in mode) {
      await client.putText(BLOB_PATHS.record(date), text, { overwrite: false });
    } else {
      await client.putText(BLOB_PATHS.record(date), text, { ifMatch: mode.ifMatch });
    }
  }

  const storage: BlobDevotionalStorage = {
    async getLatestDevotionals(opts?: GetLatestDevotionalsOptions) {
      const index = await readIndex();
      let entries = sortEntries(index.entries);
      if (opts?.limit != null && opts.limit > 0) entries = entries.slice(0, opts.limit);
      return readRecords(entries.map((e) => e.date));
    },

    async getDevotionalByDate(date: string) {
      // Friss olvasás: az admin és a generálás mindig a legutóbbi mentést lássa.
      return (await readRecord(date, true))?.devotional;
    },

    async getDevotionalsByDates(dates: string[]) {
      return readRecords([...new Set(dates)]);
    },

    async getDevotionalsFromDate(minDate: string) {
      const index = await readIndex();
      return readRecords(index.entries.filter((e) => e.date >= minDate).map((e) => e.date));
    },

    async saveDevotional(devotional: Devotional) {
      const normalized = normalizeDevotional(devotional);
      const date = devotionalDateKey(normalized);

      const index = await readIndex(true);
      if (index.entries.some((e) => e.date === date)) {
        throw new Error(`Erre a napra (${date}) már van áhítat.`);
      }

      try {
        await putRecord(date, normalized, { create: true });
      } catch (error) {
        if (error instanceof BlobAlreadyExistsError) {
          throw new Error(`Erre a napra (${date}) már van áhítat.`);
        }
        throw error;
      }

      // Sorrend: rekord → index → pillanatkép → meta. Megszakadás esetén a
      // rekord az igazság forrása, a rebuild() helyreállítja a többit.
      await upsertIndexEntry(toIndexEntry(normalized));
      await applyToWindow(date, normalized);
      await applyToMeta(normalized);
      options.onChange?.();
      return normalized;
    },

    async updateDevotional(date: string, devotional: Devotional) {
      const existing = await readRecord(date, true);
      if (!existing) throw new Error(`Nincs áhítat erre a napra: ${date}.`);

      const normalized = normalizeDevotional(devotional);
      const newDate = devotionalDateKey(normalized);

      if (newDate !== date) {
        try {
          await putRecord(newDate, normalized, { create: true });
        } catch (error) {
          if (error instanceof BlobAlreadyExistsError) {
            throw new Error(`Erre a napra (${newDate}) már van áhítat.`);
          }
          throw error;
        }
        await client.del([BLOB_PATHS.record(date)]);
        await upsertIndexEntry(toIndexEntry(normalized), date);
        await applyToWindow(date, null);
        await applyToWindow(newDate, normalized);
      } else {
        try {
          await putRecord(date, normalized, { ifMatch: existing.etag });
        } catch (error) {
          if (error instanceof BlobPreconditionError) {
            throw new Error(
              "Az áhítatot közben más módosította. Töltsd újra, és próbáld meg még egyszer."
            );
          }
          throw error;
        }
        await upsertIndexEntry(toIndexEntry(normalized));
        await applyToWindow(date, normalized);
      }

      await applyToMeta(normalized);
      options.onChange?.();
      return normalized;
    },

    async deleteDevotional(date: string) {
      const existing = await readRecord(date, true);
      if (!existing) throw new Error(`Nincs áhítat erre a napra: ${date}.`);
      await client.del([BLOB_PATHS.record(date)]);
      await removeIndexEntry(date);
      await applyToWindow(date, null);
      options.onChange?.();
    },

    async listAdminEntries(minDate: string) {
      const index = await readIndex(true);
      return sortEntries(index.entries).filter((e) => e.date >= minDate);
    },

    /**
     * Napi retention. Csak a KÖZZÉTETT, cutoff-nál régebbi áhítatot törli az
     * áhítat dátuma alapján; piszkozat / jóváhagyott / jövőbeli és a legfrissebb
     * rekord marad. Index-vezérelt: nincs `list`, és (az új indexsorokkal) a
     * rekordok olvasása sem kell. Sorrend: index (ifMatch, újraellenőrzött
     * státusszal) → rekord- és feladat-blobok → saját képek → pillanatkép.
     * Ha a blobtörlés megszakad, árva blob marad (a következő rebuild/retention
     * kezeli) — élő adat nem vész el.
     */
    async runRetention({ apply }: { apply: boolean }) {
      const index = await readIndex(true);
      const plan = planRetention(
        index.entries.map((e) => e.date),
        today()
      );
      const byDate = new Map(index.entries.map((e) => [e.date, e]));

      const result: StorageRetentionResult = {
        referenceDate: plan.referenceDate,
        retentionDays: plan.retentionDays,
        cutoff: plan.cutoff,
        keptUnpublished: [],
        removable: [],
        deleted: false,
        imagesDeleted: 0,
        imagesFailed: [],
      };
      for (const date of plan.remove) {
        if (byDate.get(date)?.status === "published") result.removable.push(date);
        else result.keptUnpublished.push(date);
      }
      if (!apply || result.removable.length === 0) return result;

      // 1) Index: csak azt vesszük ki, ami az írás pillanatában is régi + közzétett.
      const removable = new Set(result.removable);
      let removed: IndexEntry[] = [];
      await mutateJson(BLOB_PATHS.index, emptyIndex, (doc) => {
        removed = [];
        doc.entries = doc.entries.filter((e) => {
          if (removable.has(e.date) && e.status === "published") {
            removed.push(e);
            return false;
          }
          return true;
        });
      });
      result.removable = removed.map((e) => e.date).sort();
      if (removed.length === 0) return result;

      // 2) A törlendő képek URL-je (régi, imageUrl nélküli indexsornál a rekordból).
      const imageUrls: string[] = [];
      for (const entry of removed) {
        const url =
          entry.imageUrl !== undefined
            ? entry.imageUrl
            : (await readRecord(entry.date, true))?.devotional.imageUrl;
        if (isOwnedBlobImageUrl(url)) imageUrls.push(url!);
      }

      // 3) Rekord- és feladat-blobok (ingyenes törlés), majd a képek.
      await client.del(
        removed.flatMap((e) => [BLOB_PATHS.record(e.date), jobBlobPath(e.date)])
      );
      if (imageUrls.length > 0) {
        if (options.images) {
          try {
            await options.images.del(imageUrls);
            result.imagesDeleted = imageUrls.length;
          } catch (error) {
            console.error("[blob-retention] képtörlés sikertelen:", error);
            result.imagesFailed = imageUrls;
          }
        } else {
          result.imagesFailed = imageUrls;
        }
      }

      // 4) A pillanatkép megtisztítása a kiesett napoktól.
      await mutateJson(BLOB_PATHS.publicWindow, emptyWindow, (doc) => {
        const gone = new Set(result.removable);
        const cutoff = windowCutoff();
        doc.devotionals = doc.devotionals.filter((d) => {
          const date = devotionalDateKey(d);
          return !gone.has(date) && date >= cutoff;
        });
      });

      result.deleted = true;
      options.onChange?.();
      return result;
    },

    /**
     * Átvitelkor / újrainduláskor: egy külső előzmény (pl. a teljes Redis
     * történet) beolvasztása a metába. Soha nem szűkít: a meglévő értékek
     * megmaradnak, az újak hozzáadódnak.
     */
    async mergeMeta(extra: MetaExtra) {
      const { doc } = await mutateJson(BLOB_PATHS.meta, emptyMeta, (meta) => {
        const union = (current: string[], add: string[] | undefined) => [
          ...current,
          ...(add ?? []).filter((v) => v && v.trim() && !current.includes(v)),
        ];
        meta.usedVerseReferences = union(meta.usedVerseReferences, extra.usedVerseReferences);
        meta.usedTitles = union(meta.usedTitles, extra.usedTitles);
        meta.usedCategories = union(meta.usedCategories, extra.usedCategories);
        const byDate = new Map(meta.recentDays.map((d) => [d.date, d]));
        for (const d of extra.recentDays ?? []) byDate.set(d.date, d);
        meta.recentDays = [...byDate.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-RECENT_DAYS_LIMIT);
      });
      options.onChange?.();
      return doc;
    },

    async getPublicWindowDevotionals() {
      const current = await client.getText(BLOB_PATHS.publicWindow);
      if (!current) return null;
      const doc = parseJson(current.text, emptyWindow);
      const now = today();
      const cutoff = windowCutoff();
      // Az ablakot olvasáskor szűrjük, ezért éjfélkor nem kell írni.
      return doc.devotionals
        .filter((d) => {
          const date = devotionalDateKey(d);
          return date >= cutoff && date <= now;
        })
        .sort((a, b) => devotionalDateKey(b).localeCompare(devotionalDateKey(a)));
    },

    async getMeta() {
      const current = await client.getText(BLOB_PATHS.meta);
      return current ? parseJson(current.text, emptyMeta) : null;
    },

    async rebuildPublicWindow() {
      const result = await rebuildPublicWindow();
      options.onChange?.();
      return result;
    },

    async rebuild() {
      const paths = await client.list(BLOB_PATHS.recordPrefix);
      const dates = paths
        .map((p) => /^devotionals\/(\d{4}-\d{2}-\d{2})\.json$/.exec(p)?.[1])
        .filter((d): d is string => Boolean(d));
      const records = await readRecords(dates, true);

      const index: IndexDoc = {
        version: 1,
        entries: sortEntries(records.map(toIndexEntry)),
      };
      await client.putText(BLOB_PATHS.index, JSON.stringify(index));

      // A meta soha nem szűkül: a már törölt napok emlékezete megmarad.
      const existingMeta = await storage.getMeta();
      const meta = records
        .sort((a, b) => devotionalDateKey(a).localeCompare(devotionalDateKey(b)))
        .reduce(addToMeta, existingMeta ?? emptyMeta());
      await client.putText(BLOB_PATHS.meta, JSON.stringify(meta));

      await writeWindow(records);
      options.onChange?.();
      return { records: records.length };
    },
  };

  return storage;
}
