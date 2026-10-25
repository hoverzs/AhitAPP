import { NextResponse } from "next/server";
import { isValidIsoDate } from "@/lib/app-date";
import { isAdminAuthenticated } from "@/lib/auth";
import { logGeminiError } from "@/lib/gemini-client";
import {
  buildGeminiErrorApiPayload,
  toGeminiErrorDetails,
} from "@/lib/gemini-errors";
import { previewDevotionalRefinement } from "@/lib/refine-devotional";
import { storageErrorResponse } from "@/lib/storage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface RefinePreviewBody {
  date?: string;
  instruction?: string;
  updateImageKeywords?: boolean;
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  let body: RefinePreviewBody;
  try {
    body = (await request.json()) as RefinePreviewBody;
  } catch {
    return NextResponse.json({ error: "Érvénytelen JSON." }, { status: 400 });
  }

  const date = body.date;
  const instruction = body.instruction?.trim();

  if (!isValidIsoDate(date)) {
    return NextResponse.json({ error: "Érvénytelen dátum." }, { status: 400 });
  }

  if (!instruction) {
    return NextResponse.json({ error: "Az instrukció mező kötelező." }, { status: 400 });
  }

  try {
    const result = await previewDevotionalRefinement(date, instruction, {
      updateImageKeywords: body.updateImageKeywords === true,
    });

    return NextResponse.json(result);
  } catch (err) {
    const storage = storageErrorResponse(err);
    if (storage) return storage;

    logGeminiError(err, "POST /api/admin/devotional/refine");
    const details = toGeminiErrorDetails(err);
    return NextResponse.json(buildGeminiErrorApiPayload(details), {
      status: 500,
    });
  }
}
