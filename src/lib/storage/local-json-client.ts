import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  BlobAlreadyExistsError,
  BlobPreconditionError,
  type BlobGetOptions,
  type BlobPutOptions,
  type BlobTextResult,
  type JsonBlobClient,
} from "./blob/client";

function etagOf(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/**
 * Helyi fejlesztéshez: a Blob-kliens felület fájlrendszeren (egy mappa alatt).
 * Ugyanazt az ETag-alapú feltételes írást adja, mint a Blob, így a tároló-logika
 * helyben és élesben ugyanaz.
 */
export function createLocalJsonClient(rootDir: string): JsonBlobClient {
  // Az „ellenőrzés + írás” párt egy folyamaton belül sorba állítjuk (helyi fejlesztés).
  let writeQueue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const run = writeQueue.then(task, task);
    writeQueue = run.catch(() => undefined);
    return run;
  };

  const resolve = (pathname: string): string => {
    const full = path.resolve(rootDir, pathname);
    if (!full.startsWith(path.resolve(rootDir) + path.sep)) {
      throw new Error(`Érvénytelen útvonal: ${pathname}`);
    }
    return full;
  };

  async function read(pathname: string): Promise<string | null> {
    try {
      return await fs.readFile(resolve(pathname), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function walk(dir: string): Promise<string[]> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const nested = await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
      )
    );
    return nested.flat();
  }

  async function writeChecked(
    pathname: string,
    text: string,
    options?: BlobPutOptions
  ): Promise<{ etag: string }> {
    const current = await read(pathname);
    if (options?.overwrite === false && current !== null) {
      throw new BlobAlreadyExistsError(pathname);
    }
    if (
      options?.ifMatch !== undefined &&
      (current === null || etagOf(current) !== options.ifMatch)
    ) {
      throw new BlobPreconditionError(pathname);
    }
    const target = resolve(pathname);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, "utf-8");
    return { etag: etagOf(text) };
  }

  return {
    async getText(pathname: string, _options?: BlobGetOptions): Promise<BlobTextResult | null> {
      void _options;
      const text = await read(pathname);
      return text === null ? null : { text, etag: etagOf(text) };
    },

    putText(pathname: string, text: string, options?: BlobPutOptions) {
      return serialized(() => writeChecked(pathname, text, options));
    },

    async del(pathnames: string[]) {
      for (const pathname of pathnames) {
        await fs.rm(resolve(pathname), { force: true });
      }
    },

    async list(prefix: string) {
      const root = path.resolve(rootDir);
      const files = await walk(root);
      return files
        .map((f) => path.relative(root, f).split(path.sep).join("/"))
        .filter((p) => p.startsWith(prefix));
    },
  };
}
