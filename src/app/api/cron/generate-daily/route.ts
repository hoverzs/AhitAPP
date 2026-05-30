import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runDailyCronGeneration } from "@/lib/cron-generate-devotional";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** @deprecated Használd /api/cron/generate-devotional — visszafelé kompatibilitás. */
async function handleCron(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET nincs beállítva a környezeti változók között." },
      { status: 500 }
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: "Érvénytelen vagy hiányzó CRON_SECRET." },
      { status: 401 }
    );
  }

  const force =
    request.nextUrl.searchParams.get("force") === "1" ||
    request.nextUrl.searchParams.get("force") === "true";

  const result = await runDailyCronGeneration({ force });

  if (result.outcome === "error") {
    return NextResponse.json(
      { error: result.error, code: result.code, message: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: result.outcome === "created",
    skipped: result.outcome === "skipped",
    message: result.message,
    devotional: result.devotional,
  });
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
