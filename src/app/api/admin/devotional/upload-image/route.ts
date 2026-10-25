import { NextResponse } from "next/server";
import { isValidIsoDate } from "@/lib/app-date";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  ImageUploadError,
  MAX_UPLOAD_BYTES,
  uploadDevotionalImage,
} from "@/lib/devotional-image-upload";
import { storageErrorResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Admin: saját kép feltöltése az áhítathoz. Blob meghajtónál a nyilvános
 * képtárba kerül; egyébként a helyi public/images/devotionals mappába.
 */
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

  const date = formData.get("date");
  const file = formData.get("file");

  if (!isValidIsoDate(date)) {
    return NextResponse.json({ error: "Érvénytelen dátum." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Hiányzó képfájl." }, { status: 400 });
  }

  // A beolvasás előtt: a deklarált méret alapján gyors elutasítás.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "A fájl legfeljebb 5 MB lehet." }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadDevotionalImage({ date, bytes });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ImageUploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const storage = storageErrorResponse(err);
    if (storage) return storage;

    const message = err instanceof Error ? err.message : "Feltöltés sikertelen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
