import { unstable_cache } from "next/cache";
import { getAppTodayIso } from "./app-date";
import { filterPublicDevotionals, normalizeDevotional } from "./devotional-status";
import { WeeklyRecordProtectedError } from "./weekly-plan/errors";
import { getPublicWindowDates, isDateInPublicWindow } from "./public-window";
import { PUBLIC_DEVOTIONALS_CACHE_TAG } from "./storage/cache-tags";
import { isHeroImageUrl } from "./image-assets";
import {
  devotionalDateKey,
  getDevotionalStorage,
  getImageStore,
  isOwnedBlobImageUrl,
  isProductionStorageNotConfiguredError,
  isBlobStorageConfigured,
  isRemoteStorageRequired,
  isRedisStorageConfigured,
  resolveStorageDriver,
  type GetLatestDevotionalsOptions,
} from "./storage";
import type { AdminIndexEntry } from "./storage";
import type { StorageMetaSummary } from "./storage/types";
import type { Devotional, DevotionalStatus } from "./types";

export { ProductionStorageNotConfiguredError } from "./storage";
export type { GetLatestDevotionalsOptions } from "./storage";

export interface ReadDevotionalsResult {
  devotionals: Devotional[];
  storageError: string | null;
  storageHint: string | null;
  driver: ReturnType<typeof resolveStorageDriver>;
}

const STORAGE_NOT_CONFIGURED_HU =
  "A production tároló nincs konfigurálva (Upstash Redis / Vercel KV vagy Vercel Blob).";

const STORAGE_NOT_CONFIGURED_HINT =
  "Redis: Vercel → Project → Storage / Integrations → Upstash Redis, Production env: KV_REST_API_URL és KV_REST_API_TOKEN. Blob (STORAGE_DRIVER=blob): kösd a Blob store-t a projekthez (BLOB_STORE_ID). Ezután redeploy.";

/** Admin / diagnosztika — storage hiba státusszal. */
export async function readDevotionalsWithStatus(): Promise<ReadDevotionalsResult> {
  const driver = resolveStorageDriver();

  try {
    const storage = getDevotionalStorage();
    const devotionals = await storage.getLatestDevotionals();
    return {
      devotionals,
      storageError: null,
      storageHint: null,
      driver,
    };
  } catch (error) {
    if (isProductionStorageNotConfiguredError(error)) {
      return {
        devotionals: [],
        storageError: STORAGE_NOT_CONFIGURED_HU,
        storageHint: STORAGE_NOT_CONFIGURED_HINT,
        driver,
      };
    }
    throw error;
  }
}

/** Összes (retention alatt) áhítat — publikus oldalon üres listát ad storage hiba esetén. */
export async function getLatestDevotionals(
  options?: GetLatestDevotionalsOptions
): Promise<Devotional[]> {
  try {
    const storage = getDevotionalStorage();
    return await storage.getLatestDevotionals(options);
  } catch (error) {
    if (isProductionStorageNotConfiguredError(error)) {
      console.error("[getLatestDevotionals]", STORAGE_NOT_CONFIGURED_HU);
      return [];
    }
    throw error;
  }
}

/** @deprecated Használd getLatestDevotionals() — visszafelé kompatibilitás. */
export async function readDevotionals(): Promise<Devotional[]> {
  return getLatestDevotionals();
}

export function getStorageDiagnostics() {
  return {
    driver: resolveStorageDriver(),
    remoteRequired: isRemoteStorageRequired(),
    redisConfigured: isRedisStorageConfigured(),
    blobConfigured: isBlobStorageConfigured(),
  };
}

export async function writeDevotionals(devotionals: Devotional[]): Promise<void> {
  const storage = getDevotionalStorage();
  const existing = await storage.getLatestDevotionals();
  const existingByDate = new Map(existing.map((d) => [devotionalDateKey(d), d]));

  for (const entry of devotionals) {
    const normalized = normalizeDevotional(entry);
    const date = devotionalDateKey(normalized);
    if (existingByDate.has(date)) {
      await storage.updateDevotional(date, normalized);
    } else {
      await storage.saveDevotional(normalized);
    }
    existingByDate.set(date, normalized);
  }

  for (const d of existing) {
    const date = devotionalDateKey(d);
    if (!devotionals.some((entry) => devotionalDateKey(entry) === date)) {
      await storage.deleteDevotional(date);
    }
  }
}

/**
 * Egy nap teljes rekordja (admin / generálás). A tároló közvetlenül a dátumhoz
 * tartozó rekordot olvassa, nem a teljes készletet.
 */
export async function getDevotionalByDate(date: string): Promise<Devotional | undefined> {
  try {
    return await getDevotionalStorage().getDevotionalByDate(date);
  } catch (error) {
    if (isProductionStorageNotConfiguredError(error)) {
      console.error("[getDevotionalByDate]", STORAGE_NOT_CONFIGURED_HU);
      return undefined;
    }
    throw error;
  }
}

/**
 * A tároló rekordokon túli előzménye (Blob meta.json), vagy null. A generálás
 * ezzel egészíti ki a memóriát, hogy a törölt napok igehelyei is számítsanak.
 */
export async function readStoredMeta(): Promise<StorageMetaSummary | null> {
  const storage = getDevotionalStorage();
  return storage.getMeta ? storage.getMeta() : null;
}

/** „Lusta" admin: ha a tároló könnyű sorokat ad, a teljes rekordot igény szerint töltjük. */
export function isLazyAdminStorage(): boolean {
  return typeof getDevotionalStorage().listAdminEntries === "function";
}

export interface AdminEntriesResult {
  entries: AdminIndexEntry[];
  /** A tároló eredeti, rekordokon túli előzménye (használt igehelyek, kategóriák). */
  meta: StorageMetaSummary | null;
}

/** Admin: a mai nap, a jövőbeli és az elmúlt 7 nap könnyű sorai (+ a legújabb rekord). */
export async function readAdminEntries(): Promise<AdminEntriesResult> {
  const storage = getDevotionalStorage();
  if (!storage.listAdminEntries) {
    throw new Error("A tároló nem támogatja a könnyű admin-listát.");
  }
  const minDate = getPublicWindowDates().at(-1)!;
  const [entries, meta] = await Promise.all([
    storage.listAdminEntries(minDate),
    storage.getMeta?.() ?? Promise.resolve(null),
  ]);
  return { entries, meta };
}

/**
 * A nyilvános ablak gyorsítótárának élettartama. Íráskor a címke azonnal
 * érvényteleníti, ezért az 1 óra csak a „külső” változásokat késlelteti; a
 * hosszabb idő kevesebb Blob-olvasást jelent (Hobby keret).
 */
export const PUBLIC_CACHE_REVALIDATE_SECONDS = 3600;

/**
 * A nyilvános 8 napos ablak (mai nap + előző 7 nap) a Next data cache-ből.
 * Redis: egyetlen MGET 8 kulccsal. A cache kulcsa tartalmazza a mai dátumot
 * (helyi, Europe/Bucharest nap), ezért napváltáskor automatikusan új bejegyzés
 * készül; íráskor a címke érvényteleníti. Csak közzétett + tartalmas áhítat.
 */
const cachedPublicWindow = unstable_cache(
  async (today: string) => {
    const storage = getDevotionalStorage();
    // Blob: egyetlen olvasás a karbantartott pillanatképből. Ha az még nem
    // létezik, vagy a tároló nem ismeri, a nyolc dátum közvetlen olvasása.
    const snapshot = await storage.getPublicWindowDevotionals?.();
    const records =
      snapshot ?? (await storage.getDevotionalsByDates(getPublicWindowDates(today)));
    return filterPublicDevotionals(records, today).sort(
      (a, b) => devotionalDateKey(b).localeCompare(devotionalDateKey(a))
    );
  },
  ["public-window-v2"],
  {
    revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DEVOTIONALS_CACHE_TAG],
  }
);

/** Nyilvános oldalak: a közzétett áhítatok az elmúlt 8 napból, újabb elöl. */
export async function getPublicWindowDevotionals(): Promise<Devotional[]> {
  const today = getAppTodayIso();
  try {
    return await cachedPublicWindow(today);
  } catch (error) {
    // Next futtatókörnyezeten kívül (tsx script) nincs data cache.
    if (error instanceof Error && /incrementalCache/i.test(error.message)) {
      const storage = getDevotionalStorage();
      const snapshot = await storage.getPublicWindowDevotionals?.();
      const records =
        snapshot ?? (await storage.getDevotionalsByDates(getPublicWindowDates(today)));
      return filterPublicDevotionals(records, today);
    }
    if (isProductionStorageNotConfiguredError(error)) return [];
    throw error;
  }
}

export type PublicDevotionalLookup =
  | { kind: "found"; devotional: Devotional }
  | { kind: "expired" }
  | { kind: "missing" };

/**
 * Dátum szerinti nyilvános keresés. Az ablakon kívüli dátum „lejárt” (nem
 * kérdezünk le semmit a tárolóból), az ablakon belüli, de nem közzétett vagy
 * hiányzó dátum „hiányzó”.
 */
export async function lookupPublicDevotionalByDate(
  date: string
): Promise<PublicDevotionalLookup> {
  if (date > getAppTodayIso()) return { kind: "missing" };
  if (!isDateInPublicWindow(date)) return { kind: "expired" };
  const window = await getPublicWindowDevotionals();
  const devotional = window.find((d) => devotionalDateKey(d) === date);
  return devotional ? { kind: "found", devotional } : { kind: "missing" };
}

/**
 * Admin munkakészlet: mai nap, jövőbeli és az elmúlt 7 nap rekordjai — nem a
 * teljes tár. Piszkozatokkal együtt.
 */
export async function readAdminWorkingSet(): Promise<ReadDevotionalsResult> {
  const driver = resolveStorageDriver();
  try {
    const minDate = getPublicWindowDates().at(-1)!;
    const devotionals = await getDevotionalStorage().getDevotionalsFromDate(minDate);
    return { devotionals, storageError: null, storageHint: null, driver };
  } catch (error) {
    if (isProductionStorageNotConfiguredError(error)) {
      return {
        devotionals: [],
        storageError: STORAGE_NOT_CONFIGURED_HU,
        storageHint: STORAGE_NOT_CONFIGURED_HINT,
        driver,
      };
    }
    throw error;
  }
}
export async function appendDevotional(entry: Devotional): Promise<Devotional> {
  const storage = getDevotionalStorage();
  return storage.saveDevotional(normalizeDevotional(entry));
}

/**
 * Írási átjáró a heti sorozat áhítataihoz. A heti műhely folyamata
 * (`weeklyFlow`) szabadon írhat; minden más hívó (régi admin API, napi
 * generálás, finomítás) csak a védelem szabályai szerint:
 *  - jóváhagyott / közzétett heti áhítatot semmi nem módosíthat (csak olvasható);
 *  - a heti áhítat státusza (jóváhagyás, közzététel, visszavonás) nem változhat;
 *  - a heti azonosító nem módosítható.
 */
export interface DevotionalWriteOptions {
  weeklyFlow?: boolean;
  /** A lecserélt rekord (saját feltöltésű) képét ne töröljük — a régi változat visszaállíthatósága miatt. */
  keepReplacedImage?: boolean;
}

export function assertWeeklyWriteAllowed(
  existing: Devotional,
  next: { status?: DevotionalStatus; weekId?: string },
  options?: DevotionalWriteOptions
): void {
  if (!existing.weekId || options?.weeklyFlow) return;
  const date = devotionalDateKey(existing);
  const status = existing.status ?? "published";
  if (status === "approved" || status === "published") {
    throw new WeeklyRecordProtectedError(date, "locked");
  }
  if (next.weekId !== undefined && next.weekId !== existing.weekId) {
    throw new WeeklyRecordProtectedError(date, "weekId");
  }
  if (next.status !== undefined && next.status !== status) {
    throw new WeeklyRecordProtectedError(date, "status");
  }
}

export async function upsertDevotional(
  entry: Devotional,
  options?: DevotionalWriteOptions
): Promise<Devotional> {
  const storage = getDevotionalStorage();
  const normalized = normalizeDevotional(entry);
  const existing = await storage.getDevotionalByDate(devotionalDateKey(normalized));

  if (existing) {
    // A heti azonosító nélküli (pl. újragenerált) objektum nem írhatja át a heti rekordot.
    assertWeeklyWriteAllowed(
      existing,
      { status: normalized.status, weekId: normalized.weekId ?? "" },
      options
    );
    const saved = await storage.updateDevotional(devotionalDateKey(existing), normalized);
    if (!options?.keepReplacedImage) await cleanupReplacedImage(existing.imageUrl, saved.imageUrl);
    return saved;
  }

  return storage.saveDevotional(normalized);
}

async function patchDevotionalByDate(
  date: string,
  patch: Partial<Devotional>,
  options?: DevotionalWriteOptions
): Promise<Devotional> {
  const storage = getDevotionalStorage();
  const existing = await storage.getDevotionalByDate(date);

  if (!existing) {
    throw new Error(`A(z) ${date} napi áhítat nem található.`);
  }
  assertWeeklyWriteAllowed(existing, { status: patch.status, weekId: patch.weekId }, options);

  const updated = normalizeDevotional({ ...existing, ...patch });
  const saved = await storage.updateDevotional(date, updated);
  await cleanupReplacedImage(existing.imageUrl, saved.imageUrl);
  return saved;
}

export async function updateDevotionalStatus(
  date: string,
  status: DevotionalStatus,
  options?: DevotionalWriteOptions
): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDate(date, { status, updatedAt: now }, options);
}

export async function saveDevotionalAdminEdit(
  date: string,
  patch: Partial<
    Pick<
      Devotional,
      | "title"
      | "verse"
      | "content"
      | "prayer"
      | "reflectionQuestion"
      | "facebookCopy"
      | "category"
      | "status"
    >
  >
): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDate(date, {
    ...patch,
    editedByAdmin: true,
    updatedAt: now,
    contentCharCount: patch.content?.length,
  });
}

export async function saveDevotionalDraft(
  date: string,
  patch: Partial<
    Pick<
      Devotional,
      | "title"
      | "verse"
      | "content"
      | "prayer"
      | "reflectionQuestion"
      | "facebookCopy"
      | "category"
    >
  >
): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDate(date, {
    ...patch,
    status: "draft",
    editedByAdmin: true,
    updatedAt: now,
    contentCharCount: patch.content?.length,
  });
}

export interface DevotionalPexelsImagePatch {
  imageUrl: string;
  imageCredit: string;
  imagePhotographerUrl: string;
  pexelsPhotoId?: number;
}

export async function saveDevotionalPexelsImage(
  date: string,
  image: DevotionalPexelsImagePatch,
  options?: { source?: "pexels" | "pexels_auto" }
): Promise<Devotional> {
  if (isHeroImageUrl(image.imageUrl)) {
    throw new Error("A header/hero kép nem használható áhítat illusztrációként.");
  }

  const now = new Date().toISOString();
  return patchDevotionalByDate(date, {
    imageUrl: image.imageUrl.trim(),
    imageSource: options?.source ?? "pexels",
    imageCredit: image.imageCredit.trim(),
    imagePhotographerUrl: image.imagePhotographerUrl.trim(),
    pexelsPhotoId: image.pexelsPhotoId,
    editedByAdmin: true,
    updatedAt: now,
  });
}

export async function clearDevotionalImage(date: string): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDate(date, {
    imageUrl: "",
    imageSource: undefined,
    imageCredit: undefined,
    imagePhotographerUrl: undefined,
    pexelsPhotoId: undefined,
    editedByAdmin: true,
    updatedAt: now,
  });
}

export async function saveDevotionalManualImage(
  date: string,
  imageUrl: string,
  options?: { imageCredit?: string }
): Promise<Devotional> {
  const url = imageUrl.trim();
  if (!url) {
    throw new Error("Érvénytelen kép URL.");
  }
  if (isHeroImageUrl(url)) {
    throw new Error("A header/hero kép nem használható áhítat illusztrációként.");
  }

  const now = new Date().toISOString();
  return patchDevotionalByDate(date, {
    imageUrl: url,
    imageSource: "manual",
    imageCredit: options?.imageCredit?.trim() || "Feltöltött kép",
    imagePhotographerUrl: undefined,
    pexelsPhotoId: undefined,
    editedByAdmin: true,
    updatedAt: now,
  });
}

export async function saveDevotionalImageKeywords(
  date: string,
  imageKeywords: string
): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDate(date, {
    imageKeywords: imageKeywords.trim(),
    editedByAdmin: true,
    updatedAt: now,
  });
}

export async function deleteDevotionalByDate(date: string): Promise<void> {
  const storage = getDevotionalStorage();
  const existing = await storage.getDevotionalByDate(date);
  await storage.deleteDevotional(date);
  await cleanupReplacedImage(existing?.imageUrl, "");
}

/**
 * Ha egy áhítat saját (feltöltött, Blob képtárban lévő) képe lecserélődött,
 * eltávolítódott vagy az áhítat törlődött, a régi blobot töröljük. Külső
 * (Pexels) és helyi képhez soha nem nyúl. A hiba nem akadályozza a mentést —
 * legfeljebb árva kép marad.
 */
export async function cleanupReplacedImage(
  before: string | undefined,
  after: string | undefined
): Promise<void> {
  if (!before || before === after || !isOwnedBlobImageUrl(before)) return;
  const store = getImageStore();
  if (!store) return;
  try {
    await store.del([before]);
  } catch (error) {
    console.error("[cleanupReplacedImage] a régi kép törlése sikertelen:", error);
  }
}
