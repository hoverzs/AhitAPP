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

export function storageErrorStatus(error: unknown): number {
  return isProductionStorageNotConfiguredError(error) ? 503 : 500;
}

export function storageErrorMessage(error: unknown): string {
  if (isProductionStorageNotConfiguredError(error)) {
    return "Production storage is not configured.";
  }
  return error instanceof Error ? error.message : "Storage error.";
}
