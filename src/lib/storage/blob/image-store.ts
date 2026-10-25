/**
 * A feltöltött áhítat-képek tára: KÜLÖN, nyilvános Blob store (a böngészőnek és
 * a Facebook-előnézetnek elérhető URL kell). Az áhítat-adatok privát storeban
 * vannak, ide csak képek kerülnek — a kép URL-je véletlen utótagot kap.
 */
export interface ImageBlobStore {
  /** A pathname-hez a store véletlen utótagot fűz; a visszaadott URL nem kitalálható. */
  put(
    pathname: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<{ url: string }>;
  /** Csak a képtárban lévő blobokat törli; hiányzó URL nem hiba. */
  del(urls: string[]): Promise<void>;
}

/** A képek pathname-előtagja a képtárban. */
export const IMAGE_BLOB_PREFIX = "images/";

const PUBLIC_BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * Az URL a mi képtárunk blobja? (nyilvános Vercel Blob host + images/ útvonal).
 * Pexels és más külső képeket soha nem törlünk.
 */
export function isOwnedBlobImageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(PUBLIC_BLOB_HOST_SUFFIX) &&
      parsed.pathname.startsWith(`/${IMAGE_BLOB_PREFIX}`)
    );
  } catch {
    return false;
  }
}

/** Memóriabeli képtár teszteléshez (a valódi Blob nélkül). */
export class MemoryImageStore implements ImageBlobStore {
  private readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  private counter = 0;
  readonly ops = { puts: 0, deletes: 0 };
  /** Teszteléshez: a következő put elbukik. */
  failNextPut?: Error;

  async put(pathname: string, bytes: Uint8Array, contentType: string) {
    this.ops.puts += 1;
    if (this.failNextPut) {
      const error = this.failNextPut;
      this.failNextPut = undefined;
      throw error;
    }
    this.counter += 1;
    const dot = pathname.lastIndexOf(".");
    const suffixed =
      dot > 0
        ? `${pathname.slice(0, dot)}-r${this.counter}x${Math.random().toString(36).slice(2, 8)}${pathname.slice(dot)}`
        : `${pathname}-r${this.counter}`;
    this.files.set(suffixed, { bytes, contentType });
    return { url: `https://memory-store${PUBLIC_BLOB_HOST_SUFFIX}/${suffixed}` };
  }

  async del(urls: string[]) {
    for (const url of urls) {
      const pathname = new URL(url).pathname.replace(/^\//, "");
      if (this.files.delete(pathname)) this.ops.deletes += 1;
    }
  }

  urls(): string[] {
    return [...this.files.keys()].map(
      (p) => `https://memory-store${PUBLIC_BLOB_HOST_SUFFIX}/${p}`
    );
  }

  has(url: string): boolean {
    return this.files.has(new URL(url).pathname.replace(/^\//, ""));
  }

  size(): number {
    return this.files.size;
  }
}
