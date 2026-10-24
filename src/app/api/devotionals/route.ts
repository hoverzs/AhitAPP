import { NextResponse } from "next/server";
import { filterPublicDevotionals } from "@/lib/devotional-status";
import { getPublicDevotionalsCached } from "@/lib/devotionals";
import { withStorageErrorFallback } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Publikus végpont: csak közzétett áhítatok, cache-elt listából. */
export async function GET() {
  try {
    const devotionals = filterPublicDevotionals(await getPublicDevotionalsCached());
    return NextResponse.json({ devotionals });
  } catch (error) {
    console.error("[api/devotionals]", error);
    return withStorageErrorFallback(error);
  }
}
