import { NextResponse } from "next/server";
import { readDevotionals } from "@/lib/devotionals";
import { storageErrorResponse } from "@/lib/storage";

export async function GET() {
  try {
    const devotionals = await readDevotionals();
    return NextResponse.json({ devotionals });
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    throw error;
  }
}
