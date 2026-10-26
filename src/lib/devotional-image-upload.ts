import { promises as fs } from "fs";
import path from "path";
import {
  assertWeeklyWriteAllowed,
  getDevotionalByDate,
  saveDevotionalManualImage,
} from "./devotionals";
import { devotionalDateKey, getImageStore, resolveStorageDriver } from "./storage";
import type { Devotional } from "./types";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class ImageUploadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ImageUploadError";
  }
}

export interface SniffedImageType {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
}

/**
 * A fájl tényleges típusa a bájtokból (a böngésző által küldött MIME nem
 * megbízható): JPEG, PNG vagy WebP. Minden más (pl. SVG, HTML) elutasított.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);

  if (startsWith([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", ext: "png" };
  }
  // RIFF....WEBP
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

/**
 * Admin kép-feltöltés egy naphoz.
 *  - Blob meghajtó: a KÉPTÁRBA (nyilvános store, véletlen utótagú útvonal), az
 *    áhítat-adatok privát storeba. A régi saját képet a mentés után töröljük.
 *    Ha a rekord mentése elbukik, a most feltöltött képet visszavonjuk.
 *  - Helyi / Redis meghajtó: a korábbi viselkedés (public/images/devotionals).
 */
export async function uploadDevotionalImage(input: {
  date: string;
  bytes: Uint8Array;
}): Promise<{ devotional: Devotional; imageUrl: string }> {
  const { date, bytes } = input;

  if (bytes.byteLength === 0) {
    throw new ImageUploadError("Üres fájl.", 400);
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageUploadError("A fájl legfeljebb 5 MB lehet.", 400);
  }
  const type = sniffImageType(bytes);
  if (!type) {
    throw new ImageUploadError("Csak JPG, PNG vagy WebP tölthető fel.", 400);
  }

  const existing = await getDevotionalByDate(date);
  if (!existing) {
    throw new ImageUploadError("Nem található.", 404);
  }
  // Zárolt heti áhítathoz semmit nem töltünk fel (a tárolóba írás előtt ellenőrzünk).
  assertWeeklyWriteAllowed(existing, {});

  if (resolveStorageDriver() === "blob") {
    const store = getImageStore();
    if (!store) {
      throw new ImageUploadError(
        "A képfeltöltéshez be kell állítani a Blob képtárat (BLOB_IMAGES_STORE_ID vagy BLOB_IMAGES_READ_WRITE_TOKEN).",
        503
      );
    }

    const pathname = `images/${devotionalDateKey(existing)}/devotional.${type.ext}`;
    const { url } = await store.put(pathname, bytes, type.mime);

    try {
      const devotional = await saveDevotionalManualImage(date, url);
      return { devotional, imageUrl: url };
    } catch (error) {
      try {
        await store.del([url]);
      } catch (cleanupError) {
        console.error("[uploadDevotionalImage] a visszavonandó kép törlése sikertelen:", cleanupError);
      }
      throw error;
    }
  }

  const dir = path.join(process.cwd(), "public", "images", "devotionals");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${date}-${Date.now()}.${type.ext}`;
  await fs.writeFile(path.join(dir, filename), Buffer.from(bytes));
  const imageUrl = `/images/devotionals/${filename}`;
  const devotional = await saveDevotionalManualImage(date, imageUrl);
  return { devotional, imageUrl };
}
