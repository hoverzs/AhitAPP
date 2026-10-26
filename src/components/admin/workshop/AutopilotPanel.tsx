"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminErrorAlert, ConfirmDialog } from "@/components/admin/ui/AdminAlerts";
import { AdminPanel } from "@/components/admin/ui/AdminPanel";
import type { DayCoverage } from "@/lib/autopilot/coverage";
import type { AutopilotRunSummary } from "@/lib/autopilot/state";
import { WorkshopApiError } from "./workshop-api";

interface AutopilotStatus {
  today: string;
  enabled: boolean;
  running: boolean;
  reserveTarget: number;
  reserveDays: number;
  maxDailyAttempts: number;
  coverage: DayCoverage[];
  lastRun: AutopilotRunSummary | null;
}

const STATE_LABEL: Record<DayCoverage["state"], string> = {
  covered: "Kész",
  "pending-approval": "Jóváhagyásra vár",
  "in-progress": "Készül…",
  missing: "Pótlásra vár",
  exhausted: "Kimerült a napi próba",
  "no-plan": "Nincs heti terv",
  "manual-plan": "Kézi terv",
  "manual-record": "Kézi kezelés",
};

const STATE_OK = new Set<DayCoverage["state"]>(["covered", "pending-approval", "in-progress"]);

const OUTCOME_LABEL: Record<string, string> = {
  ok: "rendben",
  partial: "részben sikerült",
  stopped: "megállt (korlát)",
  failed: "hibával leállt",
  busy: "másik futás dolgozott",
  disabled: "ki volt kapcsolva",
};

function formatTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

async function call(method: "GET" | "POST", body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch("/api/admin/autopilot", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new WorkshopApiError("Hálózati hiba.", 0, "NETWORK");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new WorkshopApiError(
      typeof data.error === "string" ? data.error : "A művelet sikertelen.",
      res.status,
      typeof data.code === "string" ? data.code : undefined
    );
  }
  return data;
}

/**
 * Automatikus működés: kapcsoló, a háromnapos tartalék állapota és az utolsó
 * futás. Az autopilot hetente Geminivel tervez, napi szöveget készít és
 * jóváhagy — a heti műhely innentől opcionális szerkesztési lehetőség.
 */
export function AutopilotPanel({ onToast }: { onToast: (message: string) => void }) {
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"toggle" | "run" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus((await call("GET")) as unknown as AutopilotStatus);
      setError(null);
    } catch (e) {
      setError(e instanceof WorkshopApiError ? e.message : "Az autopilot állapota nem tölthető be.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setEnabled(enabled: boolean) {
    setConfirm(false);
    setBusy("toggle");
    try {
      setStatus((await call("POST", { action: "set_enabled", enabled })) as unknown as AutopilotStatus);
      onToast(enabled ? "Az autopilot bekapcsolva." : "Az autopilot kikapcsolva.");
    } catch (e) {
      setError(e instanceof WorkshopApiError ? e.message : "A művelet sikertelen.");
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy("run");
    setError(null);
    try {
      const data = await call("POST", { action: "run" });
      setStatus(data as unknown as AutopilotStatus);
      const summary = data.summary as AutopilotRunSummary | undefined;
      onToast(
        summary
          ? `Futás kész: ${summary.generated} új szöveg, ${summary.approved} jóváhagyás (${OUTCOME_LABEL[summary.outcome] ?? summary.outcome}).`
          : "A futás kész."
      );
    } catch (e) {
      setError(e instanceof WorkshopApiError ? e.message : "A futás sikertelen.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  const enabled = status?.enabled ?? false;
  const tomorrow = status?.coverage[1];
  const today = status?.coverage[0];
  const atRisk =
    enabled && status && (today?.state !== "covered" || (tomorrow && tomorrow.state !== "covered"));

  return (
    <AdminPanel
      title="Automatikus működés"
      description="Az autopilot hetente Geminivel tervez, naponta elkészíti és jóváhagyja az áhítatokat, és mindig 3 napnyi tartalékot tart előre. A heti műhely innentől opcionális: különleges témákra és kézi finomításra."
      action={
        status && (
          <span className={`admin-chip ${enabled ? "admin-chip-success" : ""}`}>
            {enabled ? "Bekapcsolva" : "Kikapcsolva"}
          </span>
        )
      }
    >
      {error && (
        <div className="mb-4">
          <AdminErrorAlert title="Az autopilot állapota" message={error} variant="warning" />
        </div>
      )}

      {status && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton
              variant={enabled ? "default" : "publish"}
              disabled={busy !== null}
              onClick={() => (enabled ? void setEnabled(false) : setConfirm(true))}
            >
              {enabled ? "Kikapcsolás" : "Bekapcsolás…"}
            </AdminButton>
            {enabled && (
              <AdminButton variant="regenerate" disabled={busy !== null || status.running} onClick={runNow}>
                {busy === "run" ? "Fut… (akár pár perc)" : "Futtatás most"}
              </AdminButton>
            )}
            <AdminButton variant="ghost" size="sm" disabled={busy !== null} onClick={() => void load()}>
              Frissítés
            </AdminButton>
            {enabled && (
              <p className="text-sm font-semibold text-ink">
                Előre kész: {status.reserveDays}/{status.reserveTarget} nap
              </p>
            )}
          </div>

          {atRisk && (
            <div className="mt-4">
              <AdminErrorAlert
                variant="warning"
                title="A tartalék nem teljes"
                message={
                  today?.state !== "covered"
                    ? "A mai áhítat még nincs jóváhagyva. A következő futás pótolja, vagy indítsd el most."
                    : "A holnapi áhítat még nincs kész. A következő futás pótolja, vagy indítsd el most."
                }
              />
            </div>
          )}

          <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {status.coverage.map((c, i) => (
              <li
                key={c.date}
                className={`rounded-xl border px-3 py-2 text-sm ${STATE_OK.has(c.state) ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}
                title={c.detail}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  {i === 0 ? "Ma" : i === 1 ? "Holnap" : `+${i} nap`} · {c.date}
                </p>
                <p className="font-medium text-ink">{STATE_LABEL[c.state]}</p>
              </li>
            ))}
          </ul>

          {status.lastRun && (
            <div className="mt-4 text-sm text-ink-muted">
              <p>
                Utolsó futás: <strong>{formatTime(status.lastRun.finishedAt)}</strong> —{" "}
                {OUTCOME_LABEL[status.lastRun.outcome] ?? status.lastRun.outcome} ({status.lastRun.generated} új
                szöveg, {status.lastRun.approved} jóváhagyás
                {status.lastRun.failures ? `, ${status.lastRun.failures} hiba` : ""}).
              </p>
              {status.lastRun.events.length > 0 && (
                <>
                  <button
                    type="button"
                    className="mt-1 text-xs font-semibold text-gold-600 hover:underline"
                    onClick={() => setShowEvents((v) => !v)}
                  >
                    {showEvents ? "Részletek elrejtése" : "Részletek"}
                  </button>
                  {showEvents && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {status.lastRun.events.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
          {!status.lastRun && enabled && (
            <p className="mt-4 text-sm text-ink-muted">Még nem volt futás — a következő ütemezett futás elindítja, vagy indítsd most.</p>
          )}
        </>
      )}

      {!status && !error && <p className="text-sm text-ink-muted">Betöltés…</p>}

      {confirm && (
        <ConfirmDialog
          title="Az autopilot bekapcsolása"
          message="Bekapcsolás után a napi cron az autopilotot futtatja: Geminivel heti tervet készít, napi szövegeket generál és hagy jóvá, 3 napnyi tartalékkal. A hiányos szöveg soha nem kerül nyilvánosságra. A kézi terveidhez és a már meglévő áhítatokhoz nem nyúl. Bármikor kikapcsolható."
          confirmLabel="Bekapcsolás"
          loading={busy === "toggle"}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void setEnabled(true)}
        />
      )}
    </AdminPanel>
  );
}
