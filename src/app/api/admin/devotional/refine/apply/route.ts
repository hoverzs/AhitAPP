import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { buildAdminDevotionalContext } from "@/lib/app-data";
import { readDevotionals } from "@/lib/devotionals";
import {
  applyDevotionalRefinement,
  type RefinementStatusAfter,
} from "@/lib/refine-devotional";
import type { DevotionalRefinementResult } from "@/lib/types";
import { storageErrorResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface RefineApplyBody {
  dayNumber?: number;
  instruction?: string;
  refined?: DevotionalRefinementResult;
  statusAfter?: RefinementStatusAfter;
  updateImageKeywords?: boolean;
}

function isValidRefined(value: unknown): value is DevotionalRefinementResult {
  if (!value || typeof value !== "object") return false;
  const r = value as DevotionalRefinementResult;
  return (
    typeof r.title === "string" &&
    typeof r.verse === "string" &&
    typeof r.category === "string" &&
    typeof r.content === "string" &&
    r.title.trim().length > 0 &&
    r.content.trim().length > 0
  );
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  let body: RefineApplyBody;
  try {
    body = (await request.json()) as RefineApplyBody;
  } catch {
    return NextResponse.json({ error: "Érvénytelen JSON." }, { status: 400 });
  }

  const dayNumber = body.dayNumber;
  const instruction = body.instruction?.trim();
  const statusAfter = body.statusAfter ?? "needs_review";

  if (!Number.isFinite(dayNumber) || (dayNumber ?? 0) < 1) {
    return NextResponse.json({ error: "Érvénytelen dayNumber." }, { status: 400 });
  }

  if (!instruction) {
    return NextResponse.json({ error: "Hiányzó instrukció." }, { status: 400 });
  }

  if (!isValidRefined(body.refined)) {
    return NextResponse.json({ error: "Érvénytelen finomított tartalom." }, { status: 400 });
  }

  if (!["needs_review", "published", "keep"].includes(statusAfter)) {
    return NextResponse.json({ error: "Érvénytelen statusAfter." }, { status: 400 });
  }

  try {
    const devotional = await applyDevotionalRefinement(dayNumber!, body.refined, {
      instruction,
      statusAfter,
      updateImageKeywords: body.updateImageKeywords === true,
    });

    return NextResponse.json({
      devotional,
      adminContext: await buildAdminDevotionalContext(await readDevotionals()),
    });
  } catch (err) {
    const storage = storageErrorResponse(err);
    if (storage) return storage;

    const message = err instanceof Error ? err.message : "Mentés sikertelen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
