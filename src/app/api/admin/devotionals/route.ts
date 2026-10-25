import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { entryToListItem } from "@/lib/admin-entries";
import {
  isLazyAdminStorage,
  readAdminEntries,
  readAdminWorkingSet,
} from "@/lib/devotionals";
import { toAdminListItems } from "@/lib/app-data";
import { storageErrorResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Admin lista. „Lusta" tárolónál (Blob) csak a könnyű sorok jönnek
 * (`lazy: true`, `devotionals: []`); a teljes rekordot a
 * GET /api/admin/devotional?day=<n> adja. Egyébként a teljes munkakészlet.
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  try {
    if (isLazyAdminStorage()) {
      const { entries } = await readAdminEntries();
      return NextResponse.json({
        lazy: true,
        items: entries.map(entryToListItem),
        devotionals: [],
      });
    }

    const { devotionals } = await readAdminWorkingSet();
    return NextResponse.json({
      lazy: false,
      items: toAdminListItems(devotionals),
      devotionals,
    });
  } catch (error) {
    const storage = storageErrorResponse(error);
    if (storage) return storage;
    throw error;
  }
}
