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

export function storageErrorStatus(error: unknown): number {
  return isProductionStorageNotConfiguredError(error) ? 503 : 500;
}

export function storageErrorMessage(error: unknown): string {
  if (isProductionStorageNotConfiguredError(error)) {
    return "Production storage is not configured.";
  }
  return error instanceof Error ? error.message : "Storage error.";
}
