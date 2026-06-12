import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronOrAdminRequest } from "@/lib/cron-auth";
import { processDueGenerationRetries } from "@/lib/generation-job-runner";
import { toAdminJobSummary } from "@/lib/generation-job-types";
import { storageErrorResponse } from "@/lib/storage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Esedékes óránkénti generálási retry-k (+1h / +2h / +3h az első hiba után).
 * Nincs gyakori Vercel cron (Hobby plan) — admin, külső ütemező vagy napi cron elején hívható.
 */
async function handleRetryProcessor(request: NextRequest) {
  const auth = await isAuthorizedCronOrAdminRequest(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: "Nincs jogosultság ehhez a művelethez." },
      { status: 401 }
    );
  }

  const result = await processDueGenerationRetries();

  if ("processed" in result) {
    return NextResponse.json({
      success: true,
      processed: false,
      reason: result.reason,
    });
  }

  if (result.success && result.devotional) {
    return NextResponse.json({
      success: true,
      processed: true,
      created: !result.skipped,
      devotional: {
        dayNumber: result.devotional.dayNumber,
        date: result.devotional.date,
        title: result.devotional.title,
        status: result.devotional.status,
      },
      generationJob: toAdminJobSummary(result.job),
    });
  }

  return NextResponse.json({
    success: result.job.status !== "failed",
    processed: true,
    pending_retry: result.job.status === "pending_retry",
    failed: result.job.status === "failed",
    error: result.error,
    code: result.code,
    generationJob: toAdminJobSummary(result.job),
  });
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
