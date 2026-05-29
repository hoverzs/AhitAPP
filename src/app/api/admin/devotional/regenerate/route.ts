import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { logGeminiError } from "@/lib/gemini-client";
import { toGeminiErrorDetails } from "@/lib/gemini-errors";
import { buildAdminDevotionalContext } from "@/lib/app-data";
import { readDevotionals } from "@/lib/devotionals";
import {
  regenerateDevotional,
  GenerationBlockedError,
} from "@/lib/generate-devotional";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  let body: { dayNumber?: number; backup?: boolean };
  try {
    body = (await request.json()) as { dayNumber?: number; backup?: boolean };
  } catch {
    return NextResponse.json({ error: "Érvénytelen JSON." }, { status: 400 });
  }

  const dayNumber = body.dayNumber;
  if (!Number.isFinite(dayNumber) || (dayNumber ?? 0) < 1) {
    return NextResponse.json({ error: "Érvénytelen dayNumber." }, { status: 400 });
  }

  try {
    const result = await regenerateDevotional(dayNumber!, {
      backup: body.backup !== false,
    });

    return NextResponse.json({
      devotional: result.devotional,
      backedUp: result.backedUp,
      adminContext: buildAdminDevotionalContext(await readDevotionals()),
    });
  } catch (err) {
    if (err instanceof GenerationBlockedError) {
      return NextResponse.json({ error: err.reason, code: "GENERATION_BLOCKED" }, { status: 409 });
    }

    logGeminiError(err, "POST /api/admin/devotional/regenerate");
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
