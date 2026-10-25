import { NextResponse } from "next/server";
import {
  describeStorageReasonHu,
  isProductionStorageNotConfiguredError,
  isStorageBackendError,
  storageErrorMessage,
  storageErrorReason,
  storageErrorStatus,
} from "./errors";

/**
 * Tárolóhiba → egyértelmű JSON válasz (503). Nem tárolóhibára null, így a
 * hívó a saját (pl. Gemini) hibakezelését használhatja.
 */
export function storageErrorResponse(error: unknown): NextResponse | null {
  if (isProductionStorageNotConfiguredError(error)) {
    return NextResponse.json(
      {
        error: storageErrorMessage(error),
        code: "STORAGE_NOT_CONFIGURED",
        reason: "not_configured",
        hint:
          "Connect Upstash Redis (Vercel Marketplace) and set KV_REST_API_URL + KV_REST_API_TOKEN in Production environment variables.",
      },
      { status: storageErrorStatus(error) }
    );
  }

  if (isStorageBackendError(error)) {
    const info = describeStorageReasonHu(error.reason);
    return NextResponse.json(
      {
        error: `${info.title}. ${info.message}`,
        code: "STORAGE_ERROR",
        reason: error.reason,
        hint: info.hint,
        detail: error.message,
      },
      { status: storageErrorStatus(error) }
    );
  }

  return null;
}

export function withStorageErrorFallback(error: unknown): NextResponse {
  return (
    storageErrorResponse(error) ??
    NextResponse.json(
      {
        error: storageErrorMessage(error),
        reason: storageErrorReason(error),
      },
      { status: storageErrorStatus(error) }
    )
  );
}
