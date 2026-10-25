/**
 * Minimális, szöveg-alapú Blob-kliens felület. A tároló-logika (blob-storage.ts)
 * csak ezt ismeri, így memóriabeli emulátorral tesztelhető, és a valódi Vercel
 * Blob adapter (vercel-client.ts) cserélhető.
 */

/** Feltételes írás (ifMatch) sikertelen: a blobot közben más módosította. */
export class BlobPreconditionError extends Error {
  constructor(pathname: string) {
    super(`A blob közben módosult: ${pathname}`);
    this.name = "BlobPreconditionError";
  }
}

/** Létrehozás (overwrite: false) sikertelen: a blob már létezik. */
export class BlobAlreadyExistsError extends Error {
  constructor(pathname: string) {
    super(`A blob már létezik: ${pathname}`);
    this.name = "BlobAlreadyExistsError";
  }
}

export interface BlobTextResult {
  text: string;
  etag: string;
}

export interface BlobPutOptions {
  /** Csak akkor ír, ha a blob jelenlegi ETag-je egyezik (optimista zárolás). */
  ifMatch?: string;
  /** false: csak új blobot hozhat létre. Alapértelmezés: true (felülírás engedett). */
  overwrite?: boolean;
  contentType?: string;
}

export interface BlobGetOptions {
  /** true: a gyorsítótárat megkerülve, az origin legfrissebb tartalmát olvassa. */
  fresh?: boolean;
}

export interface JsonBlobClient {
  /** null, ha a blob nem létezik. Egyszerű műveletnek számít. */
  getText(pathname: string, options?: BlobGetOptions): Promise<BlobTextResult | null>;
  /** Összetett műveletnek számít. */
  putText(
    pathname: string,
    text: string,
    options?: BlobPutOptions
  ): Promise<{ etag: string }>;
  /** Ingyenes. A nem létező útvonalat figyelmen kívül hagyja. */
  del(pathnames: string[]): Promise<void>;
  /** Összetett művelet — csak karbantartáshoz (újraépítés), forgalmas útvonalon tilos. */
  list(prefix: string): Promise<string[]>;
}
