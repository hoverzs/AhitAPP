import { NextResponse } from "next/server";
import { readDevotionals } from "@/lib/devotionals";

export async function GET() {
  const devotionals = await readDevotionals();
  return NextResponse.json({ devotionals });
}
