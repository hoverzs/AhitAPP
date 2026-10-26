"use client";

import { useMemo, useState } from "react";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminErrorAlert, ConfirmDialog } from "@/components/admin/ui/AdminAlerts";
import { AdminPanel } from "@/components/admin/ui/AdminPanel";
import { weekApprovalState, type DayView, type WeekOverview } from "@/lib/weekly-plan/ui-logic";
import { DayReviewCard } from "./DayReviewCard";
import { setDevotionalApproval, WorkshopApiError } from "./workshop-api";

interface ReviewStepProps {
  week: string;
  overview: WeekOverview;
  views: DayView[];
  onChanged: () => Promise<void>;
  onToast: (message: string) => void;
  onGoGenerate: () => void;
}

export function ReviewStep({ week, overview, views, onChanged, onToast, onGoGenerate }: ReviewStepProps) {
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approval = useMemo(() => weekApprovalState(views), [views]);
  const needsGeneration = views.some((v) => v.needsGeneration);
  const goLiveNow = views.filter((v) => v.canApprove && v.date <= overview.today);
  const scheduled = views.filter((v) => v.canApprove && v.date > overview.today);

  async function approveAll() {
    setConfirmAll(false);
    setBusy(true);
    setError(null);
    try {
      // Csak azokat a napokat küldjük, amelyeket a felület is jóváhagyhatónak lát.
      const result = await setDevotionalApproval(week, true, approval.approvable);
      onToast(
        result.skipped.length
          ? `${result.changed.length} nap jóváhagyva, ${result.skipped.length} kimaradt.`
          : `A teljes hét jóváhagyva (${result.changed.length} nap).`
      );
      await onChanged();
    } catch (e) {
      setError(e instanceof WorkshopApiError ? e.message : "A jóváhagyás sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPanel
        title="Ellenőrzés és jóváhagyás"
        description="Nézd át a napok teljes szövegét, imádságát, kérdését, képét és Facebook-ajánlóját. A jóváhagyott áhítat a saját napján automatikusan megjelenik — újabb AI-hívás nélkül."
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-ink">
            {approval.approved.length}/{views.length} nap jóváhagyva
          </p>
          <AdminButton
            variant="publish"
            disabled={!approval.canApproveAll || busy || !overview.editable}
            onClick={() => setConfirmAll(true)}
          >
            {busy ? "Jóváhagyás…" : "Teljes hét jóváhagyása"}
          </AdminButton>
          {needsGeneration && (
            <AdminButton variant="ghost" onClick={onGoGenerate}>
              ← Hiányzó napok generálása
            </AdminButton>
          )}
        </div>

        {approval.blocked.length > 0 && !approval.allApproved && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              A teljes hét még nem hagyható jóvá — ezek a napok nem készek:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {approval.blocked.map((b) => (
                <li key={b.date}>
                  <strong>{b.date}</strong> — {b.reason}
                </li>
              ))}
            </ul>
            {approval.approvable.length > 0 && (
              <p className="mt-2 text-xs text-amber-800">
                A kész napokat addig egyenként jóváhagyhatod.
              </p>
            )}
          </div>
        )}
        {approval.allApproved && (
          <p className="mt-4 text-sm text-emerald-800">
            A hét publikálásra kész: mind a 7 áhítat jóváhagyva. Mindegyik a saját napján automatikusan megjelenik.
          </p>
        )}
        {error && (
          <div className="mt-4">
            <AdminErrorAlert title="A jóváhagyás nem sikerült" message={error} variant="warning" />
          </div>
        )}
      </AdminPanel>

      <div className="space-y-4">
        {views.map((view) => (
          <DayReviewCard
            key={view.date}
            view={view}
            week={week}
            today={overview.today}
            busy={busy}
            onChanged={onChanged}
            onToast={onToast}
          />
        ))}
      </div>

      {confirmAll && (
        <ConfirmDialog
          title="Teljes hét jóváhagyása"
          message={[
            `${approval.approvable.length} nap kerül jóváhagyásra.`,
            goLiveNow.length
              ? `Azonnal nyilvános lesz: ${goLiveNow.map((v) => v.date).join(", ")}.`
              : null,
            scheduled.length
              ? `A saját napján automatikusan jelenik meg: ${scheduled.map((v) => v.date).join(", ")}.`
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          confirmLabel="Jóváhagyom"
          loading={busy}
          onCancel={() => setConfirmAll(false)}
          onConfirm={() => void approveAll()}
        />
      )}
    </div>
  );
}
