import { NextResponse } from "next/server";
import { getPublicWindowDevotionals } from "@/lib/devotionals";
import { withStorageErrorFallback } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Publikus végpont: csak a közzétett, elmúlt 8 nap áhítatai (cache-elt). */
export async function GET() {
  try {
    const devotionals = await getPublicWindowDevotionals();
    return NextResponse.json({ devotionals });
  } catch (error) {
    console.error("[api/devotionals]", error);
    return withStorageErrorFallback(error);
  }
}
