import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { logGeminiError } from "@/lib/gemini-client";
import { logGeminiKeyStatus, pingGeminiApi } from "@/lib/gemini-fetch";
import { getGeminiTlsMode } from "@/lib/gemini-tls";
import {
  buildGeminiErrorApiPayload,
  toGeminiErrorDetails,
} from "@/lib/gemini-errors";

export const dynamic = "force-dynamic";

/** Admin: Gemini API + TLS kapcsolat teszt (nem generál áhítatot). */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  console.log("Key exists:", !!process.env.GEMINI_API_KEY);
  logGeminiKeyStatus("GET /api/admin/gemini-ping");

  const tlsMode = getGeminiTlsMode();

  try {
    const result = await pingGeminiApi();
    return NextResponse.json({
      ...result,
      tlsMode,
      isDevelopment: process.env.NODE_ENV === "development",
      keyConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  } catch (err) {
    logGeminiError(err, "GET /api/admin/gemini-ping");
    console.error("Detailed Gemini Error:", err);

    const details = toGeminiErrorDetails(err);
    return NextResponse.json(
      {
        ok: false,
        keyConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        ...buildGeminiErrorApiPayload(details),
      },
      { status: 502 }
    );
  }
}
