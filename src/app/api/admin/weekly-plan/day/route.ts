import { NextRequest, NextResponse } from "next/server";
import { isValidIsoDate } from "@/lib/app-date";
import { generateWeekDay } from "@/lib/weekly-plan/day-generation";
import { WeeklyPlanInputError } from "@/lib/weekly-plan/errors";
import {
  optionalBoolean,
  readJsonObject,
  requireAdmin,
  requireWeekId,
  requiredString,
  weeklyPlanErrorResponse,
} from "@/lib/weekly-plan/http";

export const dynamic = "force-dynamic";
// Egy nap generálása (Gemini-hívás + Pexels-kép).
export const maxDuration = 300;

/**
 * Egy nap áhítatának generálása a jóváhagyott heti tervből. Folytatható: a
 * sikertelen nap csak a saját állapotát érinti.
 * POST { week, date, force? }
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await readJsonObject(request);
    const weekId = requireWeekId(body);
    const date = requiredString(body, "date");
    if (!isValidIsoDate(date)) throw new WeeklyPlanInputError("A date mező érvénytelen dátum.");

    const result = await generateWeekDay({
      weekId,
      date,
      force: optionalBoolean(body, "force"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return weeklyPlanErrorResponse(error);
  }
}
