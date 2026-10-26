import type { Devotional } from "@/lib/types";
import type { PlanIssues, WeeklyPlan } from "@/lib/weekly-plan/types";
import type { WeekOverview } from "@/lib/weekly-plan/ui-logic";

/** A heti műhely API-hívásai. A hibákat egységes WorkshopApiError-ra fordítja. */

export class WorkshopApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly body?: Record<string, unknown>
  ) {
    super(message);
    this.name = "WorkshopApiError";
  }

  get problems(): string[] {
    const value = this.body?.problems;
    return Array.isArray(value) ? value.filter((p): p is string => typeof p === "string") : [];
  }

  get issues(): PlanIssues | undefined {
    return this.body?.issues as PlanIssues | undefined;
  }

  get currentPlan(): WeeklyPlan | undefined {
    return this.body?.plan as WeeklyPlan | undefined;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new WorkshopApiError("Hálózati hiba — ellenőrizd a kapcsolatot, majd próbáld újra.", 0, "NETWORK");
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* nem JSON válasz */
  }
  if (!res.ok) {
    const message =
      typeof body.error === "string" && body.error
        ? body.error
        : res.status === 401
          ? "A munkamenet lejárt — jelentkezz be újra."
          : "A művelet sikertelen.";
    throw new WorkshopApiError(
      message,
      res.status,
      typeof body.code === "string" ? body.code : undefined,
      body
    );
  }
  return body as T;
}

export interface PlanActionResult {
  plan: WeeklyPlan;
  issues: PlanIssues;
  staleDates: string[];
  repaired?: boolean;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function fetchOverview(week: string): Promise<WeekOverview> {
  return request<WeekOverview>(`/api/admin/weekly-plan?week=${encodeURIComponent(week)}`);
}

export function planAction<T = PlanActionResult>(
  action: string,
  week: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  return request<T>("/api/admin/weekly-plan", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ action, week, ...payload }),
  });
}

export interface GenerateDayResponse {
  plan: WeeklyPlan;
  devotional: Devotional;
  reconciled: boolean;
  regenerated: boolean;
}

export function generateDay(week: string, date: string, force = false): Promise<GenerateDayResponse> {
  return request<GenerateDayResponse>("/api/admin/weekly-plan/day", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ week, date, force }),
  });
}

export interface ReplacementInfo {
  backupId: string;
  backupPath: string;
  previousStatus: string;
  previousTitle: string;
  preparedAt: string;
}

export function prepareReplacement(
  week: string,
  date: string
): Promise<{ plan: WeeklyPlan; replacement: ReplacementInfo; reused: boolean }> {
  return planAction("prepare_replacement", week, { date });
}

/** A régi áhítat kiváltása: az új szöveg generálása és csak siker esetén a csere. */
export function executeReplacement(week: string, date: string): Promise<GenerateDayResponse> {
  return request<GenerateDayResponse>("/api/admin/weekly-plan/day", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ week, date, replace: true, confirm: true }),
  });
}

export function restoreReplaced(
  week: string,
  date: string
): Promise<{ plan: WeeklyPlan; devotional: Devotional; source: string }> {
  return planAction("restore_replaced", week, { date, confirm: true });
}

export function handToAutopilot(week: string, expectedUpdatedAt: string): Promise<PlanActionResult> {
  return planAction<PlanActionResult>("hand_to_autopilot", week, { expectedUpdatedAt });
}

export interface ApprovalResponse {
  changed: string[];
  skipped: { date: string; reason: string }[];
}

export function setDevotionalApproval(
  week: string,
  approve: boolean,
  dates?: string[]
): Promise<ApprovalResponse> {
  return planAction<ApprovalResponse>(approve ? "approve_days" : "unapprove_days", week, {
    ...(dates ? { dates } : {}),
  });
}

export async function fetchDevotional(date: string): Promise<Devotional> {
  const data = await request<{ devotional: Devotional }>(
    `/api/admin/devotional?date=${encodeURIComponent(date)}`
  );
  return data.devotional;
}

export async function saveDevotionalFields(
  date: string,
  fields: Record<string, string>
): Promise<Devotional> {
  const data = await request<{ devotional: Devotional }>("/api/admin/devotional", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ date, action: "save", fields }),
  });
  return data.devotional;
}
