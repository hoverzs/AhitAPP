import { promises as fs } from "fs";
import path from "path";
import { isDevotionalStatus, normalizeDevotional } from "./devotional-status";
import { isHeroImageUrl } from "./image-assets";
import type { Devotional, DevotionalStatus } from "./types";

const DATA_PATH = path.join(process.cwd(), "data", "devotionals.json");

function isValidDevotional(entry: unknown): entry is Devotional {
  if (!entry || typeof entry !== "object") return false;
  const d = entry as Devotional;
  const hasDate = d.date === undefined || typeof d.date === "string";
  const hasStatus =
    d.status === undefined ||
    (typeof d.status === "string" && isDevotionalStatus(d.status));

  return (
    typeof d.dayNumber === "number" &&
    d.dayNumber >= 1 &&
    typeof d.title === "string" &&
    typeof d.verse === "string" &&
    typeof d.content === "string" &&
    typeof d.imageUrl === "string" &&
    typeof d.createdAt === "string" &&
    hasDate &&
    hasStatus &&
    (d.category === undefined || typeof d.category === "string") &&
    (d.facebookCopy === undefined || typeof d.facebookCopy === "string") &&
    (d.prayer === undefined || typeof d.prayer === "string") &&
    (d.reflectionQuestion === undefined || typeof d.reflectionQuestion === "string") &&
    (d.promptVersion === undefined || typeof d.promptVersion === "string") &&
    (d.generationModel === undefined || typeof d.generationModel === "string") &&
    (d.editedByAdmin === undefined || typeof d.editedByAdmin === "boolean") &&
    (d.imageKeywords === undefined || typeof d.imageKeywords === "string") &&
    (d.imageSource === undefined ||
      d.imageSource === "pexels_auto" ||
      d.imageSource === "pexels" ||
      d.imageSource === "imagen" ||
      d.imageSource === "manual") &&
    (d.imageCredit === undefined || typeof d.imageCredit === "string") &&
    (d.imagePhotographerUrl === undefined || typeof d.imagePhotographerUrl === "string") &&
    (d.pexelsPhotoId === undefined || typeof d.pexelsPhotoId === "number")
  );
}

export async function readDevotionals(): Promise<Devotional[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidDevotional).map(normalizeDevotional);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[readDevotionals]", error);
    }
    return [];
  }
}

export async function writeDevotionals(devotionals: Devotional[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  const sorted = [...devotionals].sort((a, b) => a.dayNumber - b.dayNumber);
  await fs.writeFile(DATA_PATH, JSON.stringify(sorted, null, 2), "utf-8");
}

export async function getDevotionalByDay(
  dayNumber: number
): Promise<Devotional | undefined> {
  const all = await readDevotionals();
  return all.find((d) => d.dayNumber === dayNumber);
}

export async function appendDevotional(entry: Devotional): Promise<Devotional> {
  const all = await readDevotionals();
  if (all.some((d) => d.dayNumber === entry.dayNumber)) {
    throw new Error(`A ${entry.dayNumber}. nap már létezik.`);
  }
  all.push(normalizeDevotional(entry));
  await writeDevotionals(all);
  return entry;
}

export async function upsertDevotional(entry: Devotional): Promise<Devotional> {
  const normalized = normalizeDevotional(entry);
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === normalized.dayNumber);

  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.push(normalized);
  }

  await writeDevotionals(all);
  return normalized;
}

export async function updateDevotionalStatus(
  dayNumber: number,
  status: DevotionalStatus
): Promise<Devotional> {
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === dayNumber);

  if (idx < 0) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    status,
    updatedAt: now,
    ...(status === "draft" ? {} : {}),
  };

  await writeDevotionals(all);
  return all[idx];
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
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === dayNumber);

  if (idx < 0) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    ...patch,
    editedByAdmin: true,
    updatedAt: now,
    contentCharCount: patch.content?.length ?? all[idx].contentCharCount,
  };

  await writeDevotionals(all);
  return all[idx];
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
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === dayNumber);

  if (idx < 0) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    ...patch,
    status: "draft",
    editedByAdmin: true,
    updatedAt: now,
    contentCharCount: patch.content?.length ?? all[idx].contentCharCount,
  };

  await writeDevotionals(all);
  return all[idx];
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
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === dayNumber);

  if (idx < 0) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  if (isHeroImageUrl(image.imageUrl)) {
    throw new Error("A header/hero kép nem használható áhítat illusztrációként.");
  }

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    imageUrl: image.imageUrl.trim(),
    imageSource: options?.source ?? "pexels",
    imageCredit: image.imageCredit.trim(),
    imagePhotographerUrl: image.imagePhotographerUrl.trim(),
    pexelsPhotoId: image.pexelsPhotoId,
    editedByAdmin: true,
    updatedAt: now,
  };

  await writeDevotionals(all);
  return all[idx];
}

export async function clearDevotionalImage(dayNumber: number): Promise<Devotional> {
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === dayNumber);

  if (idx < 0) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    imageUrl: "",
    imageSource: undefined,
    imageCredit: undefined,
    imagePhotographerUrl: undefined,
    pexelsPhotoId: undefined,
    editedByAdmin: true,
    updatedAt: now,
  };

  await writeDevotionals(all);
  return all[idx];
}

export async function saveDevotionalManualImage(
  dayNumber: number,
  imageUrl: string,
  options?: { imageCredit?: string }
): Promise<Devotional> {
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === dayNumber);

  if (idx < 0) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const url = imageUrl.trim();
  if (!url) {
    throw new Error("Érvénytelen kép URL.");
  }
  if (isHeroImageUrl(url)) {
    throw new Error("A header/hero kép nem használható áhítat illusztrációként.");
  }

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    imageUrl: url,
    imageSource: "manual",
    imageCredit: options?.imageCredit?.trim() || "Feltöltött kép",
    imagePhotographerUrl: undefined,
    pexelsPhotoId: undefined,
    editedByAdmin: true,
    updatedAt: now,
  };

  await writeDevotionals(all);
  return all[idx];
}

export async function saveDevotionalImageKeywords(
  dayNumber: number,
  imageKeywords: string
): Promise<Devotional> {
  const all = await readDevotionals();
  const idx = all.findIndex((d) => d.dayNumber === dayNumber);

  if (idx < 0) {
    throw new Error(`A ${dayNumber}. nap nem található.`);
  }

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    imageKeywords: imageKeywords.trim(),
    editedByAdmin: true,
    updatedAt: now,
  };

  await writeDevotionals(all);
  return all[idx];
}
