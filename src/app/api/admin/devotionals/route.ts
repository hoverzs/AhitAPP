import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { readDevotionals } from "@/lib/devotionals";
import { toAdminListItems } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  const devotionals = await readDevotionals();
  return NextResponse.json({
    items: toAdminListItems(devotionals),
    devotionals,
  });
}
