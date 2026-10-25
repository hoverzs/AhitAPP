import { NextResponse } from "next/server";
import { getAppTodayIso, isValidIsoDate } from "../app-date";
import { isAdminAuthenticated } from "../auth";
import { buildGeminiErrorApiPayload, toGeminiErrorDetails } from "../gemini-errors";
import { logGeminiError } from "../gemini-client";
import { getDevotionalStorage, storageErrorResponse } from "../storage";
import type { AdminIndexEntry } from "../storage/types";
import {
  DayAlreadyReadyError,
  DayBusyError,
  DayConflictError,
  DayIncompleteError,
  WeeklyPlanConflictError,
  WeeklyPlanGenerationError,
  WeeklyPlanInputError,
  WeeklyPlanLockedError,
  WeeklyPlanNotApprovableError,
} from "./errors";
import { PlanParseError } from "./parse";
import { BRIEF_FORMAT_EXAMPLE, WEEKDAY_NAMES_HU } from "./prompts";
import { assertWeekEditable } from "./service";
import {
  WeeklyPlanExistsError,
  WeeklyPlanNotFoundError,
  WeeklyPlanUnsupportedError,
  WeeklyPlanValidationError,
} from "./store";
import { getNextWeekStart, getWeekDates, getWeekStart, WEEK_LENGTH } from "./types";

export const MAX_BODY_CHARS = 100_000;

/** Hitelesítés: nincs admin munkamenet → 401 (a kéréshez nem nyúlunk tovább). */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminAuthenticated()) return null;
  return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
}

/** JSON objektum törzs, méretkorláttal. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    throw new WeeklyPlanInputError("A kérés túl nagy.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WeeklyPlanInputError("A kérés törzse nem érvényes JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WeeklyPlanInputError("A kérés törzse JSON objektum kell legyen.");
  }
  return parsed as Record<string, unknown>;
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new WeeklyPlanInputError(`A(z) ${key} mező szöveg kell legyen.`);
  }
  return value;
}

export function requiredString(body: Record<string, unknown>, key: string): string {
  const value = optionalString(body, key);
  if (value === undefined || !value.trim()) {
    throw new WeeklyPlanInputError(`Hiányzik a(z) ${key} mező.`);
  }
  return value;
}

export function optionalDateList(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > WEEK_LENGTH) {
    throw new WeeklyPlanInputError(`A(z) ${key} legfeljebb ${WEEK_LENGTH} dátumot tartalmazhat.`);
  }
  for (const item of value) {
    if (!isValidIsoDate(item)) {
      throw new WeeklyPlanInputError(`A(z) ${key} érvénytelen dátumot tartalmaz.`);
    }
  }
  return value as string[];
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new WeeklyPlanInputError(`A(z) ${key} mező igaz/hamis érték kell legyen.`);
  }
  return value;
}

/** A `week` lekérdezési paraméter: „current”, „next” vagy bármely dátum (a hetének hétfőjére normalizálva). */
export function resolveWeekQuery(value: string | null, today: string = getAppTodayIso()): string {
  if (!value || value === "next") return getNextWeekStart(today);
  if (value === "current") return getWeekStart(today);
  if (!isValidIsoDate(value)) {
    throw new WeeklyPlanInputError("A week paraméter érvénytelen (current, next vagy YYYY-MM-DD).");
  }
  return getWeekStart(value);
}

/** Írásnál a hét azonosítója pontosan a hétfő dátuma legyen. */
export function requireWeekId(body: Record<string, unknown>): string {
  const weekId = requiredString(body, "week");
  if (!isValidIsoDate(weekId)) throw new WeeklyPlanInputError("A week mező érvénytelen dátum.");
  assertWeekEditable(weekId);
  return weekId;
}

export interface DaySummary {
  date: string;
  weekday: string;
  devotional: null | {
    status: string;
    title: string;
    weekId?: string;
    lastApiError?: string;
    updatedAt?: string;
    imageUrl?: string;
  };
}

/** A hét napjainak áhítat-rekordjai könnyű formában (egyetlen index-olvasás Blobon). */
export async function loadDaySummaries(weekId: string): Promise<DaySummary[]> {
  const dates = getWeekDates(weekId);
  const storage = getDevotionalStorage();
  let rows: Pick<
    AdminIndexEntry,
    "date" | "status" | "title" | "weekId" | "lastApiError" | "updatedAt" | "imageUrl"
  >[];
  if (storage.listAdminEntries) {
    rows = (await storage.listAdminEntries(weekId)).filter((e) => dates.includes(e.date));
  } else {
    rows = (await storage.getDevotionalsByDates(dates)).map((d) => ({
      date: d.date,
      status: d.status ?? "published",
      title: d.title,
      weekId: d.weekId,
      lastApiError: d.lastApiError,
      updatedAt: d.updatedAt,
      imageUrl: d.imageUrl,
    }));
  }
  return dates.map((date, i) => {
    const row = rows.find((r) => r.date === date);
    return {
      date,
      weekday: WEEKDAY_NAMES_HU[i],
      devotional: row
        ? {
            status: row.status,
            title: row.title,
            weekId: row.weekId,
            lastApiError: row.lastApiError,
            updatedAt: row.updatedAt,
            imageUrl: row.imageUrl,
          }
        : null,
    };
  });
}

export { BRIEF_FORMAT_EXAMPLE };

/** Hibák leképezése HTTP-válaszra — a belső részleteket nem szivárogtatjuk. */
export function weeklyPlanErrorResponse(error: unknown): NextResponse {
  const storage = storageErrorResponse(error);
  if (storage) return storage;

  if (error instanceof WeeklyPlanConflictError) {
    return NextResponse.json(
      { error: error.message, code: "PLAN_CONFLICT", plan: error.current },
      { status: 409 }
    );
  }
  if (error instanceof WeeklyPlanNotApprovableError) {
    return NextResponse.json(
      { error: error.message, code: "NOT_APPROVABLE", issues: error.issues },
      { status: 422 }
    );
  }
  if (error instanceof PlanParseError) {
    return NextResponse.json(
      {
        error: "A szöveg nem strukturált terv.",
        code: "BRIEF_NOT_STRUCTURED",
        problems: error.problems,
        hint: "Küldd el briefként (propose + brief): a Gemini kidolgozza belőle a tervet.",
      },
      { status: 422 }
    );
  }
  if (error instanceof WeeklyPlanInputError || error instanceof WeeklyPlanValidationError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "INVALID_INPUT",
        ...(error instanceof WeeklyPlanValidationError ? { problems: error.issues } : {}),
      },
      { status: 400 }
    );
  }
  if (error instanceof WeeklyPlanNotFoundError) {
    return NextResponse.json({ error: error.message, code: "NOT_FOUND" }, { status: 404 });
  }
  if (error instanceof WeeklyPlanUnsupportedError) {
    return NextResponse.json({ error: error.message, code: "UNSUPPORTED" }, { status: 501 });
  }
  if (
    error instanceof WeeklyPlanLockedError ||
    error instanceof WeeklyPlanExistsError ||
    error instanceof DayBusyError ||
    error instanceof DayAlreadyReadyError ||
    error instanceof DayConflictError
  ) {
    return NextResponse.json(
      { error: error.message, code: error.name.replace(/Error$/, "").toUpperCase() },
      { status: 409 }
    );
  }
  if (error instanceof WeeklyPlanGenerationError) {
    return NextResponse.json(
      { error: error.message, code: "PLAN_GENERATION_FAILED", problems: error.problems },
      { status: 502 }
    );
  }
  if (error instanceof DayIncompleteError) {
    return NextResponse.json({ error: error.message, code: "DAY_INCOMPLETE" }, { status: 502 });
  }

  logGeminiError(error, "weekly-plan");
  return NextResponse.json(buildGeminiErrorApiPayload(toGeminiErrorDetails(error)), {
    status: 500,
  });
}
