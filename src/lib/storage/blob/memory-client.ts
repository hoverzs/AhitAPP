import {
  BlobAlreadyExistsError,
  BlobPreconditionError,
  type BlobGetOptions,
  type BlobPutOptions,
  type BlobTextResult,
  type JsonBlobClient,
} from "./client";

export type MemoryBlobOperation = "get" | "put" | "del" | "list";

export interface MemoryBlobFailure {
  operation: MemoryBlobOperation;
  /** Csak az erre az útvonalra illeszkedő műveleteket buktatja. */
  pathname?: string | RegExp;
  error: Error;
  /** Hányszor bukjon el (alapértelmezés: egyszer). */
  times?: number;
}

/**
 * Memóriabeli Vercel Blob emulátor teszteléshez. Ugyanazt a viselkedést adja,
 * mint a valódi: ETag-alapú feltételes írás, overwrite: false, és a műveletek
 * számlálása a Hobby keretek (egyszerű / összetett) szerint.
 */
export class MemoryBlobClient implements JsonBlobClient {
  private readonly files = new Map<string, { text: string; version: number }>();
  private failures: (MemoryBlobFailure & { remaining: number })[] = [];

  /** Egyszerű: olvasás. Összetett: put, list. A törlés ingyenes. */
  readonly ops = { simple: 0, advanced: 0, deletes: 0 };

  /** Írás előtt hívódik (versenyhelyzetek szimulálásához). */
  beforePut?: (pathname: string) => void | Promise<void>;

  failOnce(failure: MemoryBlobFailure): void {
    this.failures.push({ ...failure, remaining: failure.times ?? 1 });
  }

  resetOps(): void {
    this.ops.simple = 0;
    this.ops.advanced = 0;
    this.ops.deletes = 0;
  }

  has(pathname: string): boolean {
    return this.files.has(pathname);
  }

  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  /** Közvetlen olvasás számlálás nélkül (assertekhez). */
  peek(pathname: string): string | undefined {
    return this.files.get(pathname)?.text;
  }

  /** Közvetlen írás számlálás és ellenőrzés nélkül (tesztadatokhoz). */
  seed(pathname: string, text: string): void {
    const current = this.files.get(pathname);
    this.files.set(pathname, { text, version: (current?.version ?? 0) + 1 });
  }

  /** Közvetlen törlés számlálás nélkül. */
  remove(pathname: string): void {
    this.files.delete(pathname);
  }

  private etagOf(pathname: string, version: number): string {
    return `"${pathname}@${version}"`;
  }

  private maybeFail(operation: MemoryBlobOperation, pathname: string): void {
    const hit = this.failures.find((f) => {
      if (f.operation !== operation || f.remaining <= 0) return false;
      if (!f.pathname) return true;
      return typeof f.pathname === "string"
        ? f.pathname === pathname
        : f.pathname.test(pathname);
    });
    if (hit) {
      hit.remaining -= 1;
      throw hit.error;
    }
  }

  // A `fresh` opció a valódi klienst érinti (CDN-gyorsítótár); a memóriában nincs hatása.
  async getText(
    pathname: string,
    ...[]: [options?: BlobGetOptions]
  ): Promise<BlobTextResult | null> {
    this.ops.simple += 1;
    this.maybeFail("get", pathname);
    const file = this.files.get(pathname);
    if (!file) return null;
    return { text: file.text, etag: this.etagOf(pathname, file.version) };
  }

  async putText(
    pathname: string,
    text: string,
    options?: BlobPutOptions
  ): Promise<{ etag: string }> {
    this.ops.advanced += 1;
    this.maybeFail("put", pathname);
    if (this.beforePut) await this.beforePut(pathname);

    const current = this.files.get(pathname);
    if (options?.overwrite === false && current) {
      throw new BlobAlreadyExistsError(pathname);
    }
    if (options?.ifMatch !== undefined) {
      if (!current || this.etagOf(pathname, current.version) !== options.ifMatch) {
        throw new BlobPreconditionError(pathname);
      }
    }

    const version = (current?.version ?? 0) + 1;
    this.files.set(pathname, { text, version });
    return { etag: this.etagOf(pathname, version) };
  }

  async del(pathnames: string[]): Promise<void> {
    for (const pathname of pathnames) {
      this.maybeFail("del", pathname);
      if (this.files.delete(pathname)) this.ops.deletes += 1;
    }
  }

  async list(prefix: string): Promise<string[]> {
    this.ops.advanced += 1;
    this.maybeFail("list", prefix);
    return this.paths().filter((p) => p.startsWith(prefix));
  }
}
