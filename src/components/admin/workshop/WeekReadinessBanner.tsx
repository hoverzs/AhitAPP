import type { ReadinessStage, WeekReadiness } from "@/lib/weekly-plan/ui-logic";

const TONE: Record<ReadinessStage, string> = {
  "no-plan": "border-ivory-200 bg-white/80",
  "plan-draft": "border-ivory-200 bg-white/80",
  "plan-approved": "border-amber-300/70 bg-amber-50/50",
  "texts-ready": "border-gold-400/60 bg-gold-400/10",
  "ready-to-publish": "border-emerald-300/70 bg-emerald-50/50",
};

/**
 * Heti állapotsor: a TERV jóváhagyása és a hét PUBLIKÁLÁSRA KÉSZ állapota
 * külön szerepel — három számláló (terv, szövegek, jóváhagyott napok).
 */
export function WeekReadinessBanner({ readiness }: { readiness: WeekReadiness }) {
  const r = readiness;
  const pill = (label: string, value: string, ok: boolean) => (
    <span
      className={`admin-chip ${ok ? "admin-chip-success" : ""}`}
      title={label}
    >
      {label}: {value}
    </span>
  );

  return (
    <section
      className={`rounded-2xl border px-5 py-4 ${TONE[r.stage]}`}
      aria-label="A hét állapota"
      data-stage={r.stage}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">A hét állapota</p>
      <p className="mt-1 font-serif text-lg font-semibold leading-snug text-ink">{r.label}</p>
      <p className="mt-1 text-sm text-ink-muted">{r.detail}</p>
      {r.stage !== "no-plan" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pill("Terv", r.planApproved ? "jóváhagyva" : "vázlat", r.planApproved)}
          {pill("Szövegek", `${r.textsReady}/${r.total} kész`, r.textsReady === r.total)}
          {pill("Jóváhagyott áhítat", `${r.approvedDays}/${r.total}`, r.publishReady)}
        </div>
      )}
    </section>
  );
}
