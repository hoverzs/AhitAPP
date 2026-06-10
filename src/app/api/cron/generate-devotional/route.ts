import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronOrAdminRequest } from "@/lib/cron-auth";
import { runDailyCronGeneration } from "@/lib/cron-generate-devotional";
import { storageErrorResponse } from "@/lib/storage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ADMIN_SKIP_MESSAGE =
  "A mai napra már van áhítat. Használd az újragenerálás gombot, ha módosítani szeretnéd.";

/**
 * Vercel Cron — napi automatikus áhítat generálás.
 * Ütemezés: vercel.json → "5 0 * * *" (minden nap 00:05 UTC).
 * Auth: Authorization: Bearer <CRON_SECRET> vagy admin munkamenet.
 */
async function handleCron(request: NextRequest) {
  const startedAt = new Date().toISOString();
  const auth = await isAuthorizedCronOrAdminRequest(request);

  if (!auth) {
    console.warn(
      `[cron/generate-devotional] ${startedAt} — Érvénytelen hitelesítés (cron vagy admin).`
    );
    return NextResponse.json(
      { success: false, error: "Nincs jogosultság ehhez a művelethez." },
      { status: 401 }
    );
  }

  const force =
    auth === "admin" ||
    request.nextUrl.searchParams.get("force") === "1" ||
    request.nextUrl.searchParams.get("force") === "true";

  const result = await runDailyCronGeneration({ force });

  if (result.outcome === "pending_retry") {
    return NextResponse.json(
      {
        success: false,
        pending_retry: true,
        error: result.error,
        code: result.code,
        hint: result.hint,
        generationJob: result.generationJob,
        date: result.date,
        message: result.message,
        timestamp: result.timestamp,
      },
      { status: 202 }
    );
  }

  if (result.outcome === "error") {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        code: result.code,
        hint: "hint" in result ? result.hint : undefined,
        debug: "debug" in result ? result.debug : undefined,
        generationJob: result.generationJob,
        date: result.date,
        message: result.message,
        timestamp: result.timestamp,
      },
      { status: 500 }
    );
  }

  if (result.outcome === "blocked_env") {
    return NextResponse.json(
      {
        success: false,
        error: result.message,
        date: result.date,
        timestamp: result.timestamp,
      },
      { status: 503 }
    );
  }

  const alreadyExists = result.outcome === "skipped";
  const userMessage =
    alreadyExists && auth === "admin"
      ? ADMIN_SKIP_MESSAGE
      : result.message;

  return NextResponse.json({
    success: true,
    skipped: alreadyExists,
    created: result.outcome === "created",
    outcome: result.outcome,
    message: userMessage,
    date: result.date,
    timestamp: result.timestamp,
    devotional: result.devotional,
  });
}

export async function GET(request: NextRequest) {
  try {
    return await handleCron(request);
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handleCron(request);
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    throw error;
  }
}
