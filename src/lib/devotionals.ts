import { normalizeDevotional } from "./devotional-status";
import { isHeroImageUrl } from "./image-assets";
import {
  devotionalDateKey,
  getDevotionalStorage,
  isProductionStorageNotConfiguredError,
  isRemoteStorageRequired,
  isRedisStorageConfigured,
  resolveStorageDriver,
  type GetLatestDevotionalsOptions,
} from "./storage";
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
  "A production tároló nincs konfigurálva (Upstash Redis / Vercel KV).";

const STORAGE_NOT_CONFIGURED_HINT =
  "Vercel → Project → Storage / Integrations → Upstash Redis. Production env: KV_REST_API_URL és KV_REST_API_TOKEN. Ezután redeploy, vagy futtasd: npm run migrate:redis";

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
    return storage.getLatestDevotionals(options);
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

export async function getDevotionalByDay(
  dayNumber: number
): Promise<Devotional | undefined> {
  const all = await getLatestDevotionals();
  return all.find((d) => d.dayNumber === dayNumber);
}

export async function getDevotionalByDate(date: string): Promise<Devotional | undefined> {
  try {
    const storage = getDevotionalStorage();
    return storage.getDevotionalByDate(date);
  } catch (error) {
    if (isProductionStorageNotConfiguredError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function appendDevotional(entry: Devotional): Promise<Devotional> {
  const storage = getDevotionalStorage();
  return storage.saveDevotional(normalizeDevotional(entry));
}

export async function upsertDevotional(entry: Devotional): Promise<Devotional> {
  const storage = getDevotionalStorage();
  const normalized = normalizeDevotional(entry);
  const all = await storage.getLatestDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === normalized.dayNumber);

  if (idx >= 0) {
    const date = devotionalDateKey(all[idx]);
    return storage.updateDevotional(date, normalized);
  }

  return storage.saveDevotional(normalized);
}

async function patchDevotionalByDay(
  dayNumber: number,
  patch: Partial<Devotional>
): Promise<Devotional> {
  const storage = getDevotionalStorage();
  const all = await storage.getLatestDevotionals();
  const existing = all.find((d) => d.dayNumber === dayNumber);

  if (!existing) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const date = devotionalDateKey(existing);
  const updated = normalizeDevotional({ ...existing, ...patch });
  return storage.updateDevotional(date, updated);
}

export async function updateDevotionalStatus(
  dayNumber: number,
  status: DevotionalStatus
): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDay(dayNumber, { status, updatedAt: now });
}

export async function saveDevotionalAdminEdit(
  dayNumber: number,
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
  return patchDevotionalByDay(dayNumber, {
    ...patch,
    editedByAdmin: true,
    updatedAt: now,
    contentCharCount: patch.content?.length,
  });
}

export async function saveDevotionalDraft(
  dayNumber: number,
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
  return patchDevotionalByDay(dayNumber, {
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
  dayNumber: number,
  image: DevotionalPexelsImagePatch,
  options?: { source?: "pexels" | "pexels_auto" }
): Promise<Devotional> {
  if (isHeroImageUrl(image.imageUrl)) {
    throw new Error("A header/hero kép nem használható áhítat illusztrációként.");
  }

  const now = new Date().toISOString();
  return patchDevotionalByDay(dayNumber, {
    imageUrl: image.imageUrl.trim(),
    imageSource: options?.source ?? "pexels",
    imageCredit: image.imageCredit.trim(),
    imagePhotographerUrl: image.imagePhotographerUrl.trim(),
    pexelsPhotoId: image.pexelsPhotoId,
    editedByAdmin: true,
    updatedAt: now,
  });
}

export async function clearDevotionalImage(dayNumber: number): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDay(dayNumber, {
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
  dayNumber: number,
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
  return patchDevotionalByDay(dayNumber, {
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
  dayNumber: number,
  imageKeywords: string
): Promise<Devotional> {
  const now = new Date().toISOString();
  return patchDevotionalByDay(dayNumber, {
    imageKeywords: imageKeywords.trim(),
    editedByAdmin: true,
    updatedAt: now,
  });
}

export async function deleteDevotionalByDate(date: string): Promise<void> {
  const storage = getDevotionalStorage();
  await storage.deleteDevotional(date);
}
