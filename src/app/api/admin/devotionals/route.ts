import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { readDevotionals } from "@/lib/devotionals";
import { toAdminListItems } from "@/lib/app-data";
import { storageErrorResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  try {
    const devotionals = await readDevotionals();
    return NextResponse.json({
      items: toAdminListItems(devotionals),
      devotionals,
    });
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    throw error;
  }
}
