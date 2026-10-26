import { NextResponse } from "next/server";
import { ManagedByWeeklyPlanError, WeeklyRecordProtectedError } from "./errors";

/**
 * A régi admin API-k közös hibaleképezése a heti sorozat védelmére:
 * 409-es, géppel olvasható kóddal. Más hibára null (a hívó kezeli tovább).
 */
export function protectionResponse(error: unknown): NextResponse | null {
  if (error instanceof WeeklyRecordProtectedError) {
    return NextResponse.json(
      { error: error.message, code: "WEEKLY_PROTECTED", reason: error.reason },
      { status: 409 }
    );
  }
  if (error instanceof ManagedByWeeklyPlanError) {
    return NextResponse.json(
      { error: error.message, code: "MANAGED_BY_WEEKLY_PLAN", weekId: error.weekId },
      { status: 409 }
    );
  }
  return null;
}
