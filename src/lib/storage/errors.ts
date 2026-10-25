export class ProductionStorageNotConfiguredError extends Error {
  readonly code = "STORAGE_NOT_CONFIGURED" as const;

  constructor() {
    super("Production storage is not configured.");
    this.name = "ProductionStorageNotConfiguredError";
  }
}

export function isProductionStorageNotConfiguredError(
  error: unknown
): error is ProductionStorageNotConfiguredError {
  return (
    error instanceof ProductionStorageNotConfiguredError ||
    (error instanceof Error &&
      error.name === "ProductionStorageNotConfiguredError")
  );
}

export type StorageErrorReason =
  | "not_configured"
  | "rate_limited"
  | "unauthorized"
  | "network"
  | "unknown";

/** Titkot nem tartalmazó, publikusan is kiadható hibaosztály (diagnózishoz). */
export function storageErrorReason(error: unknown): StorageErrorReason {
  if (isProductionStorageNotConfiguredError(error)) return "not_configured";
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    msg.includes("max requests") ||
    msg.includes("plan limit") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("too many requests") ||
    msg.includes("429")
  ) {
    return "rate_limited";
  }
  if (
    msg.includes("store does not exist") ||
    msg.includes("no token found") ||
    msg.includes("access denied") ||
    msg.includes("forbidden") ||
    msg.includes("wrongpass") ||
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("invalid token") ||
    msg.includes("noperm")
  ) {
    return "unauthorized";
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econn") ||
    msg.includes("enotfound")
  ) {
    return "network";
  }
  return "unknown";
}

/**
 * A tároló (Redis) elérésekor keletkezett hiba. A Redis-kliens körüli
 * burkoló (redis-client.ts) ebbe csomagolja az Upstash/hálózati hibákat, hogy
 * a hívók meg tudják különböztetni őket a Gemini/egyéb hibáktól.
 */
export class StorageBackendError extends Error {
  readonly code = "STORAGE_ERROR" as const;
  readonly reason: StorageErrorReason;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "StorageBackendError";
    this.reason = storageErrorReason(cause);
    if (cause instanceof Error) this.cause = cause;
  }
}

export function isStorageBackendError(error: unknown): error is StorageBackendError {
  return (
    error instanceof StorageBackendError ||
    (error instanceof Error && error.name === "StorageBackendError")
  );
}

/** Bármilyen tárolóhiba: nincs konfigurálva, vagy a Redis elérése sikertelen. */
export function isAnyStorageError(error: unknown): boolean {
  return isProductionStorageNotConfiguredError(error) || isStorageBackendError(error);
}

export function storageErrorStatus(error: unknown): number {
  return isAnyStorageError(error) ? 503 : 500;
}

export function storageErrorMessage(error: unknown): string {
  if (isProductionStorageNotConfiguredError(error)) {
    return "Production storage is not configured.";
  }
  return error instanceof Error ? error.message : "Storage error.";
}

/** Magyar, felhasználóbarát cím + magyarázat a tárolóhiba okához. */
export function describeStorageReasonHu(reason: StorageErrorReason): {
  title: string;
  message: string;
  hint: string;
} {
  switch (reason) {
    case "not_configured":
      return {
        title: "Production tároló nincs beállítva",
        message: "Az Upstash Redis környezeti változói hiányoznak.",
        hint: "Vercel → Project → Storage / Integrations → Upstash Redis. Production env: KV_REST_API_URL és KV_REST_API_TOKEN, majd redeploy.",
      };
    case "rate_limited":
      return {
        title: "Az Upstash Redis korlátja elérve",
        message:
          "Az adatbázis elérte a csomagja korlátját, ezért az Upstash minden parancsot elutasít. Ez nem Gemini- vagy alkalmazáshiba.",
        hint: "Upstash Console → az adatbázis → Details / Usage: nézd meg, melyik korlát (tárhely, adatforgalom, parancsszám) telt be, és mikor újul meg.",
      };
    case "unauthorized":
      return {
        title: "Redis hozzáférési hiba",
        message: "Az Upstash elutasította a hitelesítést.",
        hint: "Ellenőrizd a KV_REST_API_TOKEN értékét a Vercel környezeti változók között.",
      };
    case "network":
      return {
        title: "A Redis nem érhető el",
        message: "A szerver nem érte el az Upstash Redis szolgáltatást (hálózati hiba vagy időtúllépés).",
        hint: "Próbáld újra pár perc múlva; ha tartós, ellenőrizd az Upstash állapotát és a KV_REST_API_URL értékét.",
      };
    default:
      return {
        title: "Tárolóhiba (Redis)",
        message: "Az áhítatok tárolójának elérése sikertelen.",
        hint: "Részletek a szerver naplóban ([redisStorage]) és az Upstash Console-ban.",
      };
  }
}
