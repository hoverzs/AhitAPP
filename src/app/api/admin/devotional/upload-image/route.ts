import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isAdminAuthenticated } from "@/lib/auth";
import { saveDevotionalManualImage } from "@/lib/devotionals";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/** Admin: saját kép feltöltése az áhítathoz (public/images/devotionals). */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Érvénytelen form adat." }, { status: 400 });
  }

  const dayNumber = Number(formData.get("dayNumber"));
  const file = formData.get("file");

  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    return NextResponse.json({ error: "Érvénytelen dayNumber." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Hiányzó képfájl." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Csak JPG, PNG vagy WebP tölthető fel." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "A fájl legfeljebb 5 MB lehet." }, { status: 400 });
  }

  try {
    const ext = extForMime(file.type);
    const dir = path.join(process.cwd(), "public", "images", "devotionals");
    await fs.mkdir(dir, { recursive: true });

    const filename = `day-${dayNumber}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(dir, filename), buffer);

    const imageUrl = `/images/devotionals/${filename}`;
    const devotional = await saveDevotionalManualImage(dayNumber, imageUrl);

    return NextResponse.json({ devotional, imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feltöltés sikertelen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
