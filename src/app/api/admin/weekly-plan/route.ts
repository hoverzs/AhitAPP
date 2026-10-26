import { NextRequest, NextResponse } from "next/server";
import { getAppTodayIso, isValidIsoDate } from "@/lib/app-date";
import { setWeekDevotionalApproval } from "@/lib/weekly-plan/day-generation";
import { prepareReplacement, restoreReplaced } from "@/lib/weekly-plan/replacement";
import { WeeklyPlanInputError } from "@/lib/weekly-plan/errors";
import {
  BRIEF_FORMAT_EXAMPLE,
  loadDaySummaries,
  optionalBoolean,
  optionalDateList,
  optionalString,
  readJsonObject,
  requireAdmin,
  requireWeekId,
  requiredString,
  resolveWeekQuery,
  weeklyPlanErrorResponse,
} from "@/lib/weekly-plan/http";
import {
  approvePlan,
  assertWeekEditable,
  deletePlanDraft,
  importPlan,
  patchPlan,
  proposePlan,
  readEffectiveRegistry,
  reopenPlan,
  revisePlan,
  type DayPatch,
  type PlanPatch,
} from "@/lib/weekly-plan/service";
import { getWeeklyPlanStore } from "@/lib/weekly-plan/store";
import { planApprovalIssues } from "@/lib/weekly-plan/types";

export const dynamic = "force-dynamic";
// A tervezés Gemini-hívást tartalmaz (propose / revise).
export const maxDuration = 300;

/**
 * A hét tervének áttekintése: terv, jóváhagyási problémák, a napok áhítat-rekordjai.
 * GET ?week=next|current|YYYY-MM-DD (alapértelmezés: a következő hét).
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const weekId = resolveWeekQuery(request.nextUrl.searchParams.get("week"));
    const store = getWeeklyPlanStore();
    const [plan, registry, days] = await Promise.all([
      store.getPlan(weekId),
      readEffectiveRegistry(store),
      loadDaySummaries(weekId),
    ]);

    let editable = true;
    try {
      assertWeekEditable(weekId);
    } catch {
      editable = false;
    }

    return NextResponse.json({
      weekId,
      today: getAppTodayIso(),
      editable,
      plan,
      issues: plan ? planApprovalIssues(plan, registry) : null,
      days,
      briefFormat: BRIEF_FORMAT_EXAMPLE,
    });
  } catch (error) {
    return weeklyPlanErrorResponse(error);
  }
}

function readDayPatches(body: Record<string, unknown>): DayPatch[] | undefined {
  const value = body.days;
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 7) {
    throw new WeeklyPlanInputError("A days mező legfeljebb 7 elemű tömb lehet.");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new WeeklyPlanInputError("A days elemei objektumok kell legyenek.");
    }
    const day = item as Record<string, unknown>;
    if (!isValidIsoDate(day.date)) {
      throw new WeeklyPlanInputError("A days elemeinek érvényes date mező kell.");
    }
    return {
      date: day.date as string,
      title: optionalString(day, "title"),
      verse: optionalString(day, "verse"),
      role: optionalString(day, "role"),
      category: optionalString(day, "category"),
      excerpt: optionalString(day, "excerpt"),
      imageKeywords: optionalString(day, "imageKeywords"),
    };
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await readJsonObject(request);
    const action = requiredString(body, "action");
    const weekId = requireWeekId(body);

    switch (action) {
      case "propose":
        return NextResponse.json(
          await proposePlan({
            weekId,
            theme: optionalString(body, "theme"),
            brief: optionalString(body, "brief"),
          })
        );

      case "import":
        return NextResponse.json(await importPlan({ weekId, text: requiredString(body, "text") }));

      case "revise":
        return NextResponse.json(
          await revisePlan({
            weekId,
            instruction: requiredString(body, "instruction"),
            expectedUpdatedAt: requiredString(body, "expectedUpdatedAt"),
          })
        );

      case "update": {
        const patch: PlanPatch = {
          theme: optionalString(body, "theme"),
          arc: optionalString(body, "arc"),
          days: readDayPatches(body),
        };
        return NextResponse.json(
          await patchPlan({
            weekId,
            patch,
            expectedUpdatedAt: requiredString(body, "expectedUpdatedAt"),
          })
        );
      }

      case "approve":
        return NextResponse.json(
          await approvePlan({
            weekId,
            expectedUpdatedAt: requiredString(body, "expectedUpdatedAt"),
            overrideRepeats: optionalDateList(body, "overrideRepeats"),
          })
        );

      case "reopen":
        return NextResponse.json(
          await reopenPlan({
            weekId,
            expectedUpdatedAt: requiredString(body, "expectedUpdatedAt"),
          })
        );

      case "delete":
        await deletePlanDraft({
          weekId,
          expectedUpdatedAt: requiredString(body, "expectedUpdatedAt"),
        });
        return NextResponse.json({ deleted: true });

      case "prepare_replacement": {
        const date = requiredString(body, "date");
        if (!isValidIsoDate(date)) throw new WeeklyPlanInputError("A date mező érvénytelen dátum.");
        return NextResponse.json(await prepareReplacement({ weekId, date }));
      }

      case "restore_replaced": {
        const date = requiredString(body, "date");
        if (!isValidIsoDate(date)) throw new WeeklyPlanInputError("A date mező érvénytelen dátum.");
        return NextResponse.json(
          await restoreReplaced({ weekId, date, confirm: optionalBoolean(body, "confirm") })
        );
      }

      case "approve_days":
      case "unapprove_days":
        return NextResponse.json(
          await setWeekDevotionalApproval({
            weekId,
            approve: action === "approve_days",
            dates: optionalDateList(body, "dates"),
          })
        );

      default:
        throw new WeeklyPlanInputError(`Ismeretlen művelet: ${action}.`);
    }
  } catch (error) {
    return weeklyPlanErrorResponse(error);
  }
}
