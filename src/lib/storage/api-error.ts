import { NextResponse } from "next/server";
import {
  isProductionStorageNotConfiguredError,
  storageErrorMessage,
  storageErrorStatus,
} from "./errors";

export function storageErrorResponse(error: unknown): NextResponse | null {
  if (!isProductionStorageNotConfiguredError(error)) {
    return null;
  }

  return NextResponse.json(
    {
      error: storageErrorMessage(error),
      code: "STORAGE_NOT_CONFIGURED",
      hint:
        "Connect Upstash Redis (Vercel Marketplace) and set KV_REST_API_URL + KV_REST_API_TOKEN in Production environment variables.",
    },
    { status: storageErrorStatus(error) }
  );
}

export function withStorageErrorFallback(error: unknown): NextResponse {
  return (
    storageErrorResponse(error) ??
    NextResponse.json(
      {
        error: storageErrorMessage(error),
      },
      { status: storageErrorStatus(error) }
    )
  );
}
