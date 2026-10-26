"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoBrandTitle, LogoMark } from "@/components/Logo";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminErrorAlert, AdminToast } from "@/components/admin/ui/AdminAlerts";
import { AdminMain, AdminShell } from "@/components/admin/ui/AdminShell";
import { addDaysToIsoDate } from "@/lib/app-date";
import { getNextWeekStart, getWeekStart } from "@/lib/weekly-plan/types";
import {
  describeWeek,
  foreignDays,
  generationProgress,
  missingPublicDays,
  suggestedStep,
  weekApprovalState,
  weekReadiness,
  type StepId,
  type WeekOverview,
} from "@/lib/weekly-plan/ui-logic";
import { GenerateStep } from "./GenerateStep";
import { PlanStep } from "./PlanStep";
import { WeekReadinessBanner } from "./WeekReadinessBanner";
import { ReviewStep } from "./ReviewStep";
import { fetchOverview, WorkshopApiError } from "./workshop-api";

const MAX_WEEKS_AHEAD = 12;

const MONTHS_HU = [
  "jan.", "febr.", "márc.", "ápr.", "máj.", "jún.",
  "júl.", "aug.", "szept.", "okt.", "nov.", "dec.",
];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS_HU[m - 1]} ${d}.`;
}

export function formatWeekRange(weekId: string): string {
  return `${weekId.slice(0, 4)}. ${shortDate(weekId)} – ${shortDate(addDaysToIsoDate(weekId, 6))}`;
}

interface WeeklyWorkshopProps {
  today: string;
  initialWeek: string;
}

export function WeeklyWorkshop({ today, initialWeek }: WeeklyWorkshopProps) {
  const router = useRouter();
  const [week, setWeek] = useState(initialWeek);
  const [overview, setOverview] = useState<WeekOverview | null>(null);
  const [loadError, setLoadError] = useState<WorkshopApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepId>("plan");
  const [toast, setToast] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stepChosenByUser = useRef(false);
  const requestId = useRef(0);

  const currentWeek = getWeekStart(today);
  const nextWeek = getNextWeekStart(today);
  const lastWeek = addDaysToIsoDate(currentWeek, MAX_WEEKS_AHEAD * 7);

  const refresh = useCallback(
    async (options?: { silent?: boolean; autoStep?: boolean }) => {
      const id = ++requestId.current;
      if (!options?.silent) setLoading(true);
      try {
        const data = await fetchOverview(week);
        if (id !== requestId.current) return; // közben másik hét töltődött
        setOverview(data);
        setLoadError(null);
        if (options?.autoStep && !stepChosenByUser.current) {
          setStep(suggestedStep(data.plan, describeWeek(data)));
        }
      } catch (error) {
        if (id !== requestId.current) return;
        setLoadError(
          error instanceof WorkshopApiError
            ? error
            : new WorkshopApiError("A hét betöltése sikertelen.", 0)
        );
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [week]
  );

  useEffect(() => {
    stepChosenByUser.current = false;
    setOverview(null);
    void refresh({ autoStep: true });
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const views = useMemo(() => (overview ? describeWeek(overview) : []), [overview]);
  const progress = useMemo(() => generationProgress(views), [views]);
  const approval = useMemo(() => weekApprovalState(views), [views]);
  const missing = useMemo(
    () => (overview ? missingPublicDays(overview.plan, views, overview.today) : []),
    [overview, views]
  );
  const foreign = useMemo(() => foreignDays(views), [views]);
  const readiness = useMemo(
    () => (overview ? weekReadiness(overview.plan, views, overview.today) : null),
    [overview, views]
  );

  function chooseStep(next: StepId) {
    stepChosenByUser.current = true;
    setStep(next);
  }

  /** Egy lépés kéri a következő lépésre ugrást (pl. terv jóváhagyása után). */
  function goTo(next: StepId) {
    stepChosenByUser.current = true;
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const plan = overview?.plan ?? null;
  const planApproved = plan?.status === "approved";
  const weekLabel = formatWeekRange(week);

  const stepMeta: { id: StepId; title: string; hint: string; done: boolean; disabled: boolean }[] = [
    {
      id: "plan",
      title: "Heti tervezés",
      hint: !plan ? "Nincs még terv" : planApproved ? "Terv jóváhagyva" : "Vázlat",
      done: planApproved,
      disabled: false,
    },
    {
      id: "generate",
      title: "Áhítatok generálása",
      hint: planApproved ? `${progress.done}/${progress.total} kész` : "Előbb hagyd jóvá a tervet",
      done: planApproved && progress.remaining === 0 && progress.generating === 0,
      disabled: !planApproved,
    },
    {
      id: "review",
      title: "Ellenőrzés és jóváhagyás",
      hint: planApproved
        ? `${approval.approved.length}/${views.length} jóváhagyva`
        : "Előbb hagyd jóvá a tervet",
      done: approval.allApproved,
      disabled: !planApproved,
    },
  ];

  return (
    <AdminShell>
      <header className="admin-header">
        <div className="admin-container admin-header-inner">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/30" aria-label="Kezdőlap">
              <LogoMark className="w-10 h-10" />
            </Link>
            <div className="min-w-0">
              <h1 className="admin-header-title flex flex-wrap items-baseline gap-x-1.5">
                <LogoBrandTitle size="sm" />
                <span className="font-sans text-sm md:text-base font-semibold text-ink-muted tracking-normal normal-case">
                  Heti műhely
                </span>
              </h1>
              <p className="admin-header-subtitle truncate">{weekLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/admin" className="admin-btn admin-btn-ghost admin-btn-sm">
              Napi nézet
            </Link>
            <AdminButton variant="ghost" size="sm" onClick={logout}>
              Kijelentkezés
            </AdminButton>
          </div>
        </div>
      </header>

      <AdminMain>
        {toast && <AdminToast message={toast} />}

        {/* Hét-választó */}
        <section className="flex flex-wrap items-center gap-2 md:gap-3" aria-label="Hét kiválasztása">
          <AdminButton
            size="sm"
            variant="ghost"
            disabled={running || week <= currentWeek}
            onClick={() => setWeek(addDaysToIsoDate(week, -7))}
            aria-label="Előző hét"
          >
            ←
          </AdminButton>
          <div className="min-w-[210px] text-center">
            <p className="font-serif text-lg font-semibold text-ink leading-tight">{weekLabel}</p>
            <p className="text-[11px] text-ink-muted">
              {week === currentWeek ? "Ez a hét" : week === nextWeek ? "Következő hét" : "Későbbi hét"}
            </p>
          </div>
          <AdminButton
            size="sm"
            variant="ghost"
            disabled={running || week >= lastWeek}
            onClick={() => setWeek(addDaysToIsoDate(week, 7))}
            aria-label="Következő hét"
          >
            →
          </AdminButton>
          <span className="mx-1 hidden h-5 w-px bg-ivory-200 sm:block" aria-hidden />
          <AdminButton size="sm" disabled={running || week === currentWeek} onClick={() => setWeek(currentWeek)}>
            Ez a hét
          </AdminButton>
          <AdminButton size="sm" disabled={running || week === nextWeek} onClick={() => setWeek(nextWeek)}>
            Következő hét előkészítése
          </AdminButton>
        </section>

        {/* Lépések */}
        <nav className="workshop-steps" aria-label="Lépések">
          {stepMeta.map((s, i) => (
            <button
              key={s.id}
              type="button"
              disabled={s.disabled || running}
              onClick={() => chooseStep(s.id)}
              aria-current={step === s.id ? "step" : undefined}
              className={`workshop-step ${step === s.id ? "workshop-step-active" : ""} ${s.done ? "workshop-step-done" : ""}`}
            >
              <span className="workshop-step-number">{s.done ? "✓" : i + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{s.title}</span>
                <span className="block truncate text-[11px] text-ink-muted">{s.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        {readiness && overview?.plan && <WeekReadinessBanner readiness={readiness} />}

        {missing.length > 0 && (
          <AdminErrorAlert
            variant="warning"
            title="Hiányzó áhítat a már elérkezett napokra"
            message={`${missing.map((m) => m.date).join(", ")} — ezekre a napokra a jóváhagyott terv még nem adott jóváhagyott áhítatot, a napi automatikus generálás pedig ki van hagyva. Az oldalon addig a legutóbbi áhítat látszik.`}
            hint="Generáld le és hagyd jóvá a hiányzó napokat."
          />
        )}

        {foreign.length > 0 && (
          <AdminErrorAlert
            variant="warning"
            title="Napi folyamatból származó áhítat a héten"
            message={`${foreign.map((f) => f.date).join(", ")} — ezeken a napokon már van másik forrásból (napi generálás) készült áhítat. A heti műhely ezt nem írja felül, és nem is generál rá.`}
          />
        )}

        {loadError && (
          <AdminErrorAlert
            title="A hét betöltése nem sikerült"
            message={loadError.message}
            hint={loadError.status === 401 ? "Jelentkezz be újra." : "Próbáld újra egy pillanat múlva."}
          />
        )}

        {loading && !overview && (
          <p className="py-16 text-center text-sm text-ink-muted" role="status">
            A hét betöltése…
          </p>
        )}

        {overview && step === "plan" && (
          <PlanStep
            week={week}
            overview={overview}
            onChanged={() => refresh({ silent: true })}
            onToast={setToast}
            onNext={() => goTo("generate")}
          />
        )}

        {overview && step === "generate" && (
          <GenerateStep
            week={week}
            overview={overview}
            views={views}
            onChanged={() => refresh({ silent: true })}
            onRunningChange={setRunning}
            onToast={setToast}
            onNext={() => goTo("review")}
            onBack={() => goTo("plan")}
          />
        )}

        {overview && step === "review" && (
          <ReviewStep
            week={week}
            overview={overview}
            views={views}
            onChanged={() => refresh({ silent: true })}
            onToast={setToast}
            onGoGenerate={() => goTo("generate")}
          />
        )}
      </AdminMain>
    </AdminShell>
  );
}
