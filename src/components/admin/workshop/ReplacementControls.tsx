"use client";

import { useState } from "react";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminErrorAlert, ConfirmDialog } from "@/components/admin/ui/AdminAlerts";
import type { DayView } from "@/lib/weekly-plan/ui-logic";
import {
  executeReplacement,
  prepareReplacement,
  restoreReplaced,
  WorkshopApiError,
} from "./workshop-api";

interface ReplacementControlsProps {
  view: DayView;
  week: string;
  /** Egy másik művelet fut a héten — a gombok zárolva. */
  busy: boolean;
  onChanged: () => Promise<void>;
  onToast: (message: string) => void;
}

/**
 * Másik forrásból (napi folyamat) származó áhítat biztonságos kiváltása:
 * 1) előkészítés = teljes mentés, semmi nem változik; 2) végrehajtás = az új
 * szöveg elkészül, és csak siker esetén cseréli a régit; 3) visszaállítás.
 */
export function ReplacementControls({ view, week, busy, onChanged, onToast }: ReplacementControlsProps) {
  const [working, setWorking] = useState<"prepare" | "execute" | "restore" | null>(null);
  const [dialog, setDialog] = useState<"execute" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rep = view.replacement;
  const show = view.canPrepareReplacement || view.canExecuteReplacement || view.canRestoreReplacement;
  if (!show) return null;
  const disabled = busy || working !== null;

  async function run(kind: "prepare" | "execute" | "restore", task: () => Promise<string>) {
    setWorking(kind);
    setError(null);
    setDialog(null);
    try {
      onToast(await task());
      await onChanged();
    } catch (e) {
      setError(e instanceof WorkshopApiError ? e.message : "A művelet sikertelen.");
      await onChanged();
    } finally {
      setWorking(null);
    }
  }

  const prepare = () =>
    run("prepare", async () => {
      const result = await prepareReplacement(week, view.date);
      return result.reused
        ? "A biztonsági mentés már megvan — a régi áhítat változatlan és élő."
        : "Biztonsági mentés kész. A régi áhítat változatlan és továbbra is élő.";
    });

  const execute = () =>
    run("execute", async () => {
      await executeReplacement(week, view.date);
      return "A csere megtörtént: az új áhítat ellenőrzésre vár (a régi a mentésben és a verziótörténetben megmaradt).";
    });

  const restore = () =>
    run("restore", async () => {
      const result = await restoreReplaced(week, view.date);
      return result.source === "backup"
        ? "A régi áhítat visszaállítva a mentésből."
        : "A régi áhítat szövege visszaállítva a verziótörténetből.";
    });

  return (
    <div className="mt-3 rounded-xl border border-gold-400/40 bg-gold-400/5 px-4 py-3 text-sm" data-replacement>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Régi áhítat kiváltása
      </p>

      {view.canPrepareReplacement && (
        <>
          <p className="mt-1 text-ink-muted">
            A(z) {view.date} napon már van egy másik forrásból készült áhítat
            {view.summary?.title ? ` („${view.summary.title}”)` : ""}. Közvetlenül nem írjuk felül. A
            <strong> csere előkészítése</strong> teljes biztonsági mentést készít róla — közben semmi nem
            változik, az áhítat élő marad.
          </p>
          <div className="mt-3">
            <AdminButton size="sm" variant="edit" disabled={disabled} onClick={prepare}>
              {working === "prepare" ? "Mentés készül…" : "Csere előkészítése (biztonsági mentés)"}
            </AdminButton>
          </div>
        </>
      )}

      {view.canExecuteReplacement && rep && (
        <>
          <p className="mt-1 text-ink-muted">
            Biztonsági mentés kész ({rep.preparedAt.slice(0, 16).replace("T", " ")} UTC) a(z) „{rep.previousTitle}”
            áhítatról. A régi áhítat még <strong>élő</strong>.
          </p>
          <div className="mt-3">
            <AdminButton size="sm" variant="regenerate" disabled={disabled} onClick={() => setDialog("execute")}>
              {working === "execute" ? "Új áhítat készül… (30–60 mp)" : "Csere végrehajtása…"}
            </AdminButton>
          </div>
        </>
      )}

      {view.canRestoreReplacement && rep?.executedAt && (
        <>
          <p className="mt-1 text-ink-muted">
            Ezt az áhítatot a heti terv váltotta ki a(z) „{rep.previousTitle}” helyett. A régi szöveg a
            mentésben és a verziótörténetben megvan.
          </p>
          <div className="mt-3">
            <AdminButton size="sm" variant="default" disabled={disabled} onClick={() => setDialog("restore")}>
              {working === "restore" ? "Visszaállítás…" : "Régi áhítat visszaállítása…"}
            </AdminButton>
          </div>
        </>
      )}

      {error && (
        <div className="mt-3">
          <AdminErrorAlert title="A művelet nem sikerült" message={error} variant="warning" />
        </div>
      )}

      {dialog === "execute" && (
        <ConfirmDialog
          title="Csere végrehajtása"
          message={`Most készül az új áhítat a heti tervből. A régi áhítat addig élő marad, és csak akkor cserélődik le, ha az új szöveg hiánytalanul elkészült (hiba esetén a régi érintetlen). A csere után az új áhítat ellenőrzésre vár — a jóváhagyásig a(z) ${view.date} nap nyilvánosan üres lesz. A régi szöveg bármikor visszaállítható.`}
          confirmLabel="Csere végrehajtása"
          loading={working === "execute"}
          onCancel={() => setDialog(null)}
          onConfirm={() => void execute()}
        />
      )}
      {dialog === "restore" && (
        <ConfirmDialog
          title="Régi áhítat visszaállítása"
          message="A mentett régi áhítat azonnal visszakerül (a korábbi státuszával, nyilvánosan is). A jelenlegi heti szöveg a verziótörténetben megmarad."
          confirmLabel="Visszaállítás"
          loading={working === "restore"}
          onCancel={() => setDialog(null)}
          onConfirm={() => void restore()}
        />
      )}
    </div>
  );
}
