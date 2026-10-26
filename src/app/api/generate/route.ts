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
import { getAppTodayIso } from "@/lib/app-date";
import { protectionResponse } from "@/lib/weekly-plan/protection-response";

export const maxDuration = 300;

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  logGeminiKeyStatus("POST /api/generate");

  try {
    const { memory: memoryBefore } = await loadGenerationMemory();
    const result = await generateNextDevotional();
    const adminContext = await buildAdminDevotionalContext(await readDevotionals());

    return NextResponse.json({
      devotional: result.devotional,
      generation: {
        action: result.action,
        date: result.targetDate,
      },
      adminContext,
      memory: {
        previousCount: memoryBefore.totalPublished,
        generatedDate: result.devotional.date,
      },
    });
  } catch (err) {
    const storage = storageErrorResponse(err);
    if (storage) return storage;
    const protectedResponse = protectionResponse(err);
    if (protectedResponse) return protectedResponse;

    if (isDuplicateVerseExhaustedError(err)) {
      return NextResponse.json(
        {
          error: err.message,
          code: "DUPLICATE_VERSE",
          hint: "Ez nem API-hiba. A rendszer automatikusan újrapróbálta másik igehellyel; indítsd újra, és friss alapigét keres.",
          severity: "warning",
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
      // Csak a mai nap függő, napi folyamatból származó rekordjához írunk hibát — más napé és a heti sorozaté ne változzon.
      const today = getAppTodayIso();
      const pending = history.find(
        (d) =>
          d.date === today && !d.weekId && (d.status === "needs_review" || d.status === "draft")
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
