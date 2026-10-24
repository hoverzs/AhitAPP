import { NextResponse } from "next/server";
import { readDevotionals } from "@/lib/devotionals";
import { withStorageErrorFallback } from "@/lib/storage";

export async function GET() {
  try {
    const devotionals = await readDevotionals();
    return NextResponse.json({ devotionals });
  } catch (error) {
    console.error("[api/devotionals]", error);
    return withStorageErrorFallback(error);
  }
}
