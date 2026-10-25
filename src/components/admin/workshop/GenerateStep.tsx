"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminPanel } from "@/components/admin/ui/AdminPanel";
import {
  DAY_LABEL_HU,
  generationProgress,
  generationQueue,
  shouldStopQueue,
  type DayView,
  type WeekOverview,
} from "@/lib/weekly-plan/ui-logic";
import { generateDay, WorkshopApiError } from "./workshop-api";

interface GenerateStepProps {
  week: string;
  overview: WeekOverview;
  views: DayView[];
  onChanged: () => Promise<void>;
  onRunningChange: (running: boolean) => void;
  onToast: (message: string) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Ezek a válaszok nem hibák: a nap épp készül, vagy már kész — a sor tovább lép. */
const SKIP_CODES = new Set(["DAYBUSY", "DAYALREADYREADY"]);

const LABEL_TONE: Record<string, string> = {
  review: "admin-chip admin-chip-success",
  approved: "admin-chip admin-chip-success",
  published: "admin-chip admin-chip-success",
  failed: "admin-chip admin-chip-warning",
  interrupted: "admin-chip admin-chip-warning",
  stale: "admin-chip admin-chip-warning",
  incomplete: "admin-chip admin-chip-warning",
};

export function GenerateStep({
  week,
  overview,
  views,
  onChanged,
  onRunningChange,
  onToast,
  onNext,
  onBack,
}: GenerateStepProps) {
  const plan = overview.plan;
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [stopNote, setStopNote] = useState<string | null>(null);
  const [sessionDone, setSessionDone] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const stopRequested = useRef(false);

  const progress = generationProgress(views);
  const queue = generationQueue(views);
  const liveElsewhere = !running && progress.generating > 0;
  const canGenerate = overview.editable && plan?.status === "approved";

  // Más munkamenetben / lapon indított generálás: figyeljük, amíg be nem fejeződik.
  useEffect(() => {
    if (!liveElsewhere) return;
    const timer = setInterval(() => void onChanged(), 8000);
    return () => clearInterval(timer);
  }, [liveElsewhere, onChanged]);

  // Futás közben az oldal elhagyása megszakítaná a sort.
  useEffect(() => {
    if (!running) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const runQueue = useCallback(
    async (dates: string[]) => {
      if (dates.length === 0) return;
      stopRequested.current = false;
      setStopNote(null);
      setRunning(true);
      onRunningChange(true);
      setSessionTotal(dates.length);
      setSessionDone(0);

      let consecutiveFailures = 0;
      let succeeded = 0;
      let failed = 0;
      let stoppedBecause: string | null = null;

      for (const date of dates) {
        if (stopRequested.current) {
          stoppedBecause = "A sor leállítva. A kész napok megmaradtak — a „Folytatás” a hiányzókkal megy tovább.";
          break;
        }
        setCurrent(date);
        try {
          await generateDay(week, date);
          succeeded++;
          consecutiveFailures = 0;
          setRunErrors((prev) => {
            const next = { ...prev };
            delete next[date];
            return next;
          });
        } catch (error) {
          const apiError = error instanceof WorkshopApiError ? error : null;
          if (apiError?.code && SKIP_CODES.has(apiError.code)) {
            // nem hiba: tovább
          } else if (apiError?.status === 401) {
            stoppedBecause = "A munkamenet lejárt — jelentkezz be újra, majd folytasd.";
            break;
          } else {
            failed++;
            consecutiveFailures++;
            setRunErrors((prev) => ({
              ...prev,
              [date]: apiError?.message ?? "Váratlan hiba történt.",
            }));
            if (shouldStopQueue(consecutiveFailures)) {
              stoppedBecause =
                "Két egymást követő nap sikertelen volt, ezért megálltam (valószínűleg átmeneti szolgáltatási hiba). A kész napok megmaradtak — egy kis várakozás után folytathatod.";
              await onChanged();
              break;
            }
          }
        }
        setSessionDone((n) => n + 1);
        await onChanged();
      }

      setCurrent(null);
      setRunning(false);
      onRunningChange(false);
      setStopNote(stoppedBecause);
      await onChanged();
      onToast(
        failed === 0 && !stoppedBecause
          ? `Kész: ${succeeded} áhítat elkészült.`
          : `${succeeded} elkészült, ${failed} sikertelen.`
      );
    },
    [week, onChanged, onRunningChange, onToast]
  );

  if (!plan || plan.status !== "approved") {
    return (
      <AdminPanel title="Áhítatok generálása">
        <p className="text-sm text-ink-muted">Előbb hagyd jóvá a heti tervet.</p>
        <div className="mt-4">
          <AdminButton onClick={onBack}>← Vissza a tervhez</AdminButton>
        </div>
      </AdminPanel>
    );
  }

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const allDone = progress.remaining === 0 && progress.generating === 0;

  return (
    <div className="space-y-6">
      <AdminPanel
        title="A hét áhítatainak generálása"
        description="Egy gomb elindítja a hiányzó napokat, naponta egy külön kéréssel. A már elkészült áhítatok érintetlenek maradnak; megszakítás vagy hiba után ugyanitt folytatható."
      >
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">
            {progress.done}/{progress.total} nap kész
          </p>
          <p className="text-xs text-ink-muted">{percent}%</p>
        </div>
        <div className="workshop-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="workshop-progress-bar" style={{ width: `${percent}%` }} />
        </div>

        {running && (
          <p className="mt-3 text-sm text-ink" role="status">
            Készül: <strong>{current}</strong> ({Math.min(sessionDone + 1, sessionTotal)}/{sessionTotal}).
            Egy nap ~30–60 mp. Ne zárd be az oldalt.
          </p>
        )}
        {liveElsewhere && (
          <p className="mt-3 text-sm text-ink-muted" role="status">
            Egy nap generálása folyamatban van (másik lapon vagy korábbi indításból). Az állapot
            automatikusan frissül.
          </p>
        )}
        {stopNote && (
          <div className="admin-alert admin-alert-warning mt-4" role="status">
            <p className="admin-alert-message">{stopNote}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <AdminButton
              variant="primary"
              size="lg"
              disabled={!canGenerate || queue.length === 0 || liveElsewhere}
              onClick={() => runQueue(queue)}
            >
              {queue.length === 0
                ? "Minden nap kész"
                : progress.done > 0 || progress.failed > 0
                  ? `Folytatás — ${queue.length} hiányzó áhítat`
                  : `Hiányzó áhítatok generálása (${queue.length})`}
            </AdminButton>
          ) : (
            <AdminButton
              variant="danger"
              onClick={() => {
                stopRequested.current = true;
                setStopNote("A leállítás a jelenlegi nap befejezése után lép érvénybe…");
              }}
            >
              Leállítás a jelenlegi nap után
            </AdminButton>
          )}
          {allDone && (
            <AdminButton variant="publish" onClick={onNext}>
              Tovább az ellenőrzéshez →
            </AdminButton>
          )}
        </div>
      </AdminPanel>

      <AdminPanel title="Napok" noPadding>
        <ul className="divide-y divide-ivory-200/70">
          {views.map((v) => {
            const isCurrent = running && current === v.date;
            const error = runErrors[v.date] ?? (v.label === "failed" ? v.planDay.error : undefined);
            return (
              <li key={v.date} className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-6">
                <div className="min-w-[130px]">
                  <p className="text-sm font-semibold text-ink">{v.weekday}</p>
                  <p className="text-[11px] text-ink-muted">{v.date}</p>
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm text-ink">{v.planDay.title || "—"}</p>
                  <p className="truncate text-xs text-ink-muted">{v.planDay.verse.split(/\s+[—–-]\s+/)[0]}</p>
                  {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
                </div>
                <span className={LABEL_TONE[v.label] ?? "admin-chip"}>
                  {isCurrent ? "Készül…" : DAY_LABEL_HU[v.label]}
                </span>
                {v.needsGeneration && !running && !liveElsewhere && canGenerate && (
                  <AdminButton size="sm" onClick={() => runQueue([v.date])}>
                    {v.label === "failed" || v.label === "interrupted" || v.label === "stale"
                      ? "Újra"
                      : "Generálás"}
                  </AdminButton>
                )}
              </li>
            );
          })}
        </ul>
      </AdminPanel>

      <div className="flex justify-between">
        <AdminButton variant="ghost" disabled={running} onClick={onBack}>
          ← Terv
        </AdminButton>
        {progress.done > 0 && (
          <AdminButton disabled={running} onClick={onNext}>
            Ellenőrzés →
          </AdminButton>
        )}
      </div>
    </div>
  );
}
