import { NextRequest, NextResponse } from "next/server";
import { getAppTodayIso } from "@/lib/app-date";
import { computeCoverage, reserveDaysFrom, MAX_DAILY_ATTEMPTS } from "@/lib/autopilot/coverage";
import { runAutopilot } from "@/lib/autopilot/run";
import { readAutopilotState, RESERVE_DAYS, setAutopilotEnabled } from "@/lib/autopilot/state";
import { WeeklyPlanInputError } from "@/lib/weekly-plan/errors";
import {
  optionalBoolean,
  readJsonObject,
  requireAdmin,
  requiredString,
  weeklyPlanErrorResponse,
} from "@/lib/weekly-plan/http";

export const dynamic = "force-dynamic";
// A „Futtatás most” Gemini-hívásokat tartalmazhat.
export const maxDuration = 300;

async function status() {
  const today = getAppTodayIso();
  const [state, coverage] = await Promise.all([readAutopilotState(), computeCoverage({ today })]);
  return {
    today,
    enabled: state.enabled,
    enabledAt: state.enabledAt,
    running: Boolean(state.runningSince),
    reserveTarget: RESERVE_DAYS,
    reserveDays: reserveDaysFrom(coverage),
    maxDailyAttempts: MAX_DAILY_ATTEMPTS,
    coverage,
    lastRun: state.lastRun ?? null,
    recentRuns: state.recentRuns,
  };
}

/** Az autopilot állapota: kapcsoló, a tartalék lefedettsége, az utolsó futások. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json(await status());
  } catch (error) {
    return weeklyPlanErrorResponse(error);
  }
}

/** POST { action: "set_enabled", enabled } | { action: "run" } */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await readJsonObject(request);
    const action = requiredString(body, "action");

    if (action === "set_enabled") {
      const enabled = optionalBoolean(body, "enabled");
      if (enabled === undefined) throw new WeeklyPlanInputError("Hiányzik az enabled (igaz/hamis) mező.");
      await setAutopilotEnabled(enabled);
      return NextResponse.json(await status());
    }
    if (action === "run") {
      const summary = await runAutopilot({ trigger: "admin" });
      return NextResponse.json({ summary, ...(await status()) });
    }
    throw new WeeklyPlanInputError(`Ismeretlen művelet: ${action}.`);
  } catch (error) {
    return weeklyPlanErrorResponse(error);
  }
}
