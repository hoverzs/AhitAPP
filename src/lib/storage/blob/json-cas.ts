import {
  BlobAlreadyExistsError,
  BlobPreconditionError,
  type JsonBlobClient,
} from "./client";

const MAX_CONFLICT_RETRIES = 8;
const DEFAULT_BACKOFF_MS = 25;

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isConflict(error: unknown): boolean {
  return error instanceof BlobPreconditionError || error instanceof BlobAlreadyExistsError;
}

/**
 * JSON dokumentum optimista (ETag-alapú) módosítása: olvasás → módosítás →
 * feltételes írás; ütközéskor rövid, véletlenszerű várakozás után újra.
 * A `mutate` több próbálkozás miatt többször is lefuthat — tiszta függvény legyen.
 */
export async function mutateJsonDocument<T>(
  client: JsonBlobClient,
  pathname: string,
  parse: (text: string) => T | null,
  mutate: (current: T | null) => T,
  options: { backoffMs?: number } = {}
): Promise<T> {
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const existing = await client.getText(pathname, { fresh: true });
    const current = existing ? parse(existing.text) : null;
    const next = mutate(current);
    try {
      await client.putText(
        pathname,
        JSON.stringify(next),
        existing ? { ifMatch: existing.etag } : { overwrite: false }
      );
      return next;
    } catch (error) {
      if (!isConflict(error)) throw error;
      await sleep(Math.random() * backoffMs * (attempt + 1));
    }
  }
  throw new Error(`Egyidejű módosítás miatt nem sikerült menteni: ${pathname}`);
}
