import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { logGeminiError } from "@/lib/gemini-client";
import { logGeminiKeyStatus } from "@/lib/gemini-fetch";
import {
  buildGeminiErrorApiPayload,
  toGeminiErrorDetails,
} from "@/lib/gemini-errors";
import { isDuplicateVerseExhaustedError } from "@/lib/duplicate-verse-retry";
import {
  generateNextDevotional,
  GenerationBlockedError,
  loadGenerationMemory,
} from "@/lib/generate-devotional";
import { buildAdminDevotionalContext } from "@/lib/app-data";
import { readDevotionals, upsertDevotional } from "@/lib/devotionals";
import { storageErrorResponse } from "@/lib/storage";

export const maxDuration = 300;

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  logGeminiKeyStatus("POST /api/generate");

  try {
    const { memory: memoryBefore } = await loadGenerationMemory();
    const result = await generateNextDevotional();
    const adminContext = buildAdminDevotionalContext(await readDevotionals());

    return NextResponse.json({
      devotional: result.devotional,
      generation: {
        action: result.action,
        dayNumber: result.targetDayNumber,
      },
      adminContext,
      memory: {
        previousCount: memoryBefore.totalPublished,
        generatedDay: result.devotional.dayNumber,
      },
    });
  } catch (err) {
    const storage = storageErrorResponse(err);
    if (storage) return storage;

    if (isDuplicateVerseExhaustedError(err)) {
      return NextResponse.json(
        {
          error: err.message,
          code: "DUPLICATE_VERSE",
          hint: "A modell háromszor is ismételt igehelyet választott. Próbáld újra a generálást.",
          rejectedReferences: err.rejectedReferences,
        },
        { status: 409 }
      );
    }

    if (err instanceof GenerationBlockedError) {
      return NextResponse.json(
        {
          error: err.reason,
          code: "GENERATION_BLOCKED",
          hint: "Előbb jóvá kell hagyni vagy közzétenni a jelenlegi áhítatot, vagy újragenerálni ugyanarra a napra.",
        },
        { status: 409 }
      );
    }

    logGeminiError(err, "POST /api/generate");

    const details = toGeminiErrorDetails(err);

    try {
      const history = await readDevotionals();
      const pending = history.find(
        (d) => d.status === "needs_review" || d.status === "draft"
      );
      if (pending) {
        await upsertDevotional({
          ...pending,
          lastApiError: details.message,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      /* best effort */
    }

    return NextResponse.json(buildGeminiErrorApiPayload(details), {
      status: 500,
    });
  }
}
