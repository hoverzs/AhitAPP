import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronOrAdminRequest } from "@/lib/cron-auth";
import {
  isRetentionAutoDeleteEnabled,
  resolveStorageDriver,
  runDevotionalRetention,
  withStorageErrorFallback,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron — napi egyszeri retention (vercel.json: "0 3 * * *").
 * A mai nap + előző 7 nap marad; a régebbi, KÖZZÉTETT áhítatok törlődnek (az
 * áhítat dátuma alapján, Europe/Bucharest nap). Piszkozat, jóváhagyott,
 * jövőbeli és a legfrissebb rekord megmarad.
 *
 * Törlés csak DEVOTIONAL_RETENTION_AUTO_DELETE=true esetén; különben csak
 * előnézetet ad vissza ("deleted": false). Auth: Bearer <CRON_SECRET> vagy admin.
 */
async function handle(request: NextRequest) {
  if (!(await isAuthorizedCronOrAdminRequest(request))) {
    return NextResponse.json({ success: false, error: "Nincs jogosultság." }, { status: 401 });
  }

  if (resolveStorageDriver() !== "redis") {
    return NextResponse.json({ success: true, skipped: "A retention csak Redis tárolónál fut." });
  }

  try {
    const apply = isRetentionAutoDeleteEnabled();
    const result = await runDevotionalRetention({ apply });
    return NextResponse.json({ success: true, autoDelete: apply, ...result });
  } catch (error) {
    console.error("[cron/prune-devotionals]", error);
    return withStorageErrorFallback(error);
  }
}

export const GET = handle;
export const POST = handle;
