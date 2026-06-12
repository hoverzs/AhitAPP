import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { processDueGenerationRetries } from "@/lib/generation-job-runner";
import { buildRetryProcessorResponse } from "@/lib/cron-retry-response";
import { storageErrorResponse } from "@/lib/storage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Esedékes óránkénti generálási retry-k (+1h / +2h / +3h az első hiba után).
 *
 * Vercel Hobby: nincs gyakori cron a vercel.json-ban — külső ütemező hívja
 * (pl. cron-job.org) 01:05, 02:05, 03:05 Europe/Bucharest idő szerint.
 *
 * Lokális teszt:
 *   curl -X POST http://localhost:3000/api/cron/process-generation-retries \
 *     -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Production teszt:
 *   curl -X POST https://ahit-app.vercel.app/api/cron/process-generation-retries \
 *     -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Tartalék (nem ajánlott): ?secret=<CRON_SECRET>
 */
async function handleRetryProcessor(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        processed: false,
        status: null,
        message: "CRON_SECRET nincs beállítva a szerveren.",
        nextRetryAt: null,
        retryCount: 0,
      },
      { status: 503 }
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        processed: false,
        status: null,
        message: "Unauthorized — érvénytelen vagy hiányzó CRON_SECRET.",
        nextRetryAt: null,
        retryCount: 0,
      },
      { status: 401 }
    );
  }

  const result = await processDueGenerationRetries();
  const body = buildRetryProcessorResponse(result);

  const httpStatus =
    body.processed && body.status === "failed" ? 500 : 200;

  return NextResponse.json(body, { status: httpStatus });
}

export async function GET(request: NextRequest) {
  try {
    return await handleRetryProcessor(request);
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handleRetryProcessor(request);
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    throw error;
  }
}
