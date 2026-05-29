import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { logGeminiError } from "@/lib/gemini-client";
import { toGeminiErrorDetails } from "@/lib/gemini-errors";
import { previewDevotionalRefinement } from "@/lib/refine-devotional";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface RefinePreviewBody {
  dayNumber?: number;
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

  const dayNumber = body.dayNumber;
  const instruction = body.instruction?.trim();

  if (!Number.isFinite(dayNumber) || (dayNumber ?? 0) < 1) {
    return NextResponse.json({ error: "Érvénytelen dayNumber." }, { status: 400 });
  }

  if (!instruction) {
    return NextResponse.json({ error: "Az instrukció mező kötelező." }, { status: 400 });
  }

  try {
    const result = await previewDevotionalRefinement(dayNumber!, instruction, {
      updateImageKeywords: body.updateImageKeywords === true,
    });

    return NextResponse.json(result);
  } catch (err) {
    logGeminiError(err, "POST /api/admin/devotional/refine");
    const details = toGeminiErrorDetails(err);
    return NextResponse.json(
      {
        error: details.message,
        code: details.code,
        hint: details.hint,
      },
      { status: 500 }
    );
  }
}
