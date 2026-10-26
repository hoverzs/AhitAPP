import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronOrAdminRequest } from "@/lib/cron-auth";
import { runAutopilot } from "@/lib/autopilot/run";
import { storageErrorResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron — az autopilot napi futásai (vercel.json: több, külön napi időpont).
 * Ha az autopilot ki van kapcsolva, azonnal visszatér, semmit nem csinál.
 * Auth: Bearer <CRON_SECRET> vagy admin munkamenet.
 */
async function handle(request: NextRequest) {
  const auth = await isAuthorizedCronOrAdminRequest(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "Nincs jogosultság." }, { status: 401 });
  }
  try {
    const summary = await runAutopilot({ trigger: auth === "admin" ? "admin" : "cron" });
    return NextResponse.json(
      { success: summary.outcome !== "failed", ...summary },
      { status: summary.outcome === "failed" ? 500 : 200 }
    );
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    console.error("[cron/autopilot]", error);
    return NextResponse.json({ success: false, error: "Az autopilot futása hibával leállt." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
