import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDevotionalByDay } from "@/lib/devotionals";
import { isPexelsConfigured, searchPexelsPhotos } from "@/lib/pexels";

export const dynamic = "force-dynamic";

interface SearchBody {
  dayNumber?: number;
  query?: string;
  category?: string;
}

/** Admin: Pexels stockfotó keresés (kulcs csak szerveren). */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  if (!isPexelsConfigured()) {
    return NextResponse.json(
      {
        error: "A PEXELS_API_KEY nincs beállítva.",
        hint: "Add hozzá a .env.local fájlhoz: PEXELS_API_KEY=...",
      },
      { status: 503 }
    );
  }

  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "Érvénytelen JSON." }, { status: 400 });
  }

  let query = body.query?.trim() ?? "";
  let category = body.category?.trim();

  if (body.dayNumber != null) {
    const devotional = await getDevotionalByDay(body.dayNumber);
    if (!devotional) {
      return NextResponse.json({ error: "Nem található áhítat." }, { status: 404 });
    }
    if (!query) query = devotional.imageKeywords?.trim() ?? "";
    if (!category) category = devotional.category?.trim();
  }

  if (!query && !category) {
    return NextResponse.json(
      {
        error: "Nincs keresési kulcsszó.",
        hint: "Generáld újra az áhítatot (imageKeywords), vagy adj meg query mezőt.",
      },
      { status: 400 }
    );
  }

  try {
    const { photos, searchQuery } = await searchPexelsPhotos({
      query,
      category,
      perPage: 6,
    });

    return NextResponse.json({
      photos,
      searchQuery,
      count: photos.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pexels keresés sikertelen.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
