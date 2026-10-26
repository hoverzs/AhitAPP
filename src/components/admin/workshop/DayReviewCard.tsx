"use client";

import { useState } from "react";
import { AdminDevotionalEditor, initEditableFields } from "@/components/admin/AdminDevotionalEditor";
import { AdminDevotionalImagePanel } from "@/components/admin/AdminDevotionalImagePanel";
import { AdminDevotionalRefineModal } from "@/components/admin/AdminDevotionalRefineModal";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminErrorAlert, ConfirmDialog } from "@/components/admin/ui/AdminAlerts";
import { CopyButton } from "@/components/CopyButton";
import { DevotionalContent } from "@/components/devotional/DevotionalContent";
import type { EditableDevotionalFields } from "@/lib/devotional-fields";
import { formatDevotionalForFacebook, getPublicDevotionalUrl } from "@/lib/facebook";
import type { Devotional } from "@/lib/types";
import { DAY_LABEL_HU, type DayView } from "@/lib/weekly-plan/ui-logic";
import { ReplacementControls } from "./ReplacementControls";
import {
  fetchDevotional,
  generateDay,
  saveDevotionalFields,
  setDevotionalApproval,
  WorkshopApiError,
} from "./workshop-api";

interface DayReviewCardProps {
  view: DayView;
  week: string;
  today: string;
  /** Egy másik művelet fut a héten (pl. teljes heti jóváhagyás) — a gombok zárolva. */
  busy: boolean;
  onChanged: () => Promise<void>;
  onToast: (message: string) => void;
}

const CHIP: Record<string, string> = {
  review: "admin-chip",
  approved: "admin-chip admin-chip-success",
  published: "admin-chip admin-chip-success",
  stale: "admin-chip admin-chip-warning",
  incomplete: "admin-chip admin-chip-warning",
  failed: "admin-chip admin-chip-warning",
  interrupted: "admin-chip admin-chip-warning",
  foreign: "admin-chip admin-chip-warning",
};

export function DayReviewCard({ view, week, today, busy, onChanged, onToast }: DayReviewCardProps) {
  const [open, setOpen] = useState(false);
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<EditableDevotionalFields | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const disabled = busy || working !== null;
  const summary = view.summary;
  const live = view.label === "generating";
  const publicNow = view.locked && view.date <= today;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDevotional(await fetchDevotional(view.date));
    } catch (e) {
      setError(e instanceof WorkshopApiError ? e.message : "A szöveg betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !devotional && summary) await load();
  }

  async function act<T>(label: string, task: () => Promise<T>, done: (result: T) => string) {
    setWorking(label);
    setError(null);
    try {
      const result = await task();
      onToast(done(result));
      await onChanged();
      return result;
    } catch (e) {
      setError(e instanceof WorkshopApiError ? e.message : "A művelet sikertelen.");
      return undefined;
    } finally {
      setWorking(null);
    }
  }

  const approve = () =>
    act(
      "approve",
      () => setDevotionalApproval(week, true, [view.date]),
      (r) =>
        r.changed.length
          ? view.date > today
            ? `Jóváhagyva — ${view.date}-án automatikusan megjelenik.`
            : "Jóváhagyva — az áhítat nyilvános."
          : (r.skipped[0]?.reason ?? "Nem hagyható jóvá.")
    );

  const revoke = async () => {
    await act(
      "revoke",
      () => setDevotionalApproval(week, false, [view.date]),
      (r) => (r.changed.length ? "Jóváhagyás visszavonva — szerkeszthető." : (r.skipped[0]?.reason ?? "Nem vonható vissza."))
    );
    // A kártya adata friss legyen (a státusz és a szerkeszthetőség változott).
    setDevotional(null);
    if (open) await load();
  };

  const regenerate = async () => {
    setConfirmRegenerate(false);
    await act(
      "regenerate",
      () => generateDay(week, view.date, true),
      () => "Az áhítat újragenerálva (a korábbi változat a verziótörténetben megmaradt)."
    );
    setDevotional(null);
    if (open) await load();
  };

  const saveFields = async () => {
    if (!fields) return;
    const saved = await act(
      "save",
      () => saveDevotionalFields(view.date, fields as unknown as Record<string, string>),
      () => "Mentve."
    );
    if (saved) {
      setDevotional(saved);
      setFields(null);
    }
  };

  const facebookText = devotional
    ? formatDevotionalForFacebook(devotional, getPublicDevotionalUrl(devotional.date))
    : "";

  return (
    <article
      className={`workshop-day-card ${view.locked ? "workshop-day-card-approved" : view.canApprove ? "" : "workshop-day-card-blocked"}`}
    >
      <header className="flex flex-wrap items-start gap-4 px-5 py-4 md:px-6">
        {summary?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={summary.imageUrl}
              alt=""
              className="h-16 w-24 shrink-0 rounded-xl border border-ivory-200 object-cover"
              loading="lazy"
            />
          </>
        ) : (
          <div className="h-16 w-24 shrink-0 rounded-xl border border-dashed border-ivory-200 bg-ivory-50" aria-hidden />
        )}

        <div className="min-w-0 flex-1 basis-60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {view.weekday} · {view.date}
          </p>
          <h3 className="font-serif text-lg font-semibold leading-snug text-ink">
            {summary?.title || view.planDay.title || "—"}
          </h3>
          <p className="truncate text-xs text-ink-muted">{view.planDay.verse.split(/\s+[—–-]\s+/)[0]}</p>
          {view.locked && (
            <p className="mt-1 text-xs text-emerald-800">
              {publicNow ? "Nyilvános az oldalon." : `Megjelenik ${view.date}-án automatikusan.`}
            </p>
          )}
          {view.canApprove && view.planDay.manualHold && (
            <p className="mt-1 text-xs text-ink-muted">
              Kézi kezelés alatt: az autopilot nem hagyja jóvá automatikusan — hagyd jóvá itt.
            </p>
          )}
          {!view.canApprove && !view.locked && view.blockedReason && (
            <p className="mt-1 text-xs text-amber-800">{view.blockedReason}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={CHIP[view.label] ?? "admin-chip"}>{DAY_LABEL_HU[view.label]}</span>
          {summary && (
            <AdminButton size="sm" variant="ghost" onClick={toggle} aria-expanded={open}>
              {open ? "Összecsukás" : "Teljes áhítat"}
            </AdminButton>
          )}
          {view.canApprove && (
            <AdminButton size="sm" variant="publish" disabled={disabled} onClick={approve}>
              {working === "approve" ? "…" : "Jóváhagyás"}
            </AdminButton>
          )}
          {view.locked && (
            <AdminButton size="sm" variant="default" disabled={disabled} onClick={revoke}>
              {working === "revoke" ? "…" : "Visszavonás"}
            </AdminButton>
          )}
        </div>
      </header>

      {(view.canPrepareReplacement || view.canExecuteReplacement || view.canRestoreReplacement) && (
        <div className="px-5 pb-4 md:px-6">
          <ReplacementControls view={view} week={week} busy={busy || working !== null} onChanged={onChanged} onToast={onToast} />
        </div>
      )}

      {error && (
        <div className="px-5 pb-4 md:px-6">
          <AdminErrorAlert title="A művelet nem sikerült" message={error} variant="warning" />
        </div>
      )}

      {open && (
        <div className="border-t border-ivory-200/70 bg-[#faf9f6]/50">
          {loading && <p className="p-6 text-sm text-ink-muted">Betöltés…</p>}

          {devotional && (
            <>
              <div className="flex flex-wrap gap-2 border-b border-ivory-200/60 px-5 py-3 md:px-6">
                {view.locked ? (
                  <p className="text-xs text-ink-muted">
                    A jóváhagyott áhítat csak olvasható. Szerkesztéshez vagy cseréhez előbb vond vissza a jóváhagyást.
                  </p>
                ) : (
                  <>
                    <AdminButton
                      size="sm"
                      variant="edit"
                      disabled={disabled || !view.editable}
                      onClick={() => setFields(fields ? null : initEditableFields(devotional))}
                    >
                      {fields ? "Szerkesztés bezárása" : "Szerkesztés"}
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="regenerate"
                      disabled={disabled || !view.editable || fields !== null}
                      onClick={() => setRefineOpen(true)}
                    >
                      AI-finomítás
                    </AdminButton>
                  </>
                )}
                {!view.locked && view.label !== "foreign" && !live && (
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => setConfirmRegenerate(true)}
                  >
                    Újragenerálás
                  </AdminButton>
                )}
              </div>

              {fields ? (
                <div className="p-5 md:p-8">
                  <AdminDevotionalEditor fields={fields} onChange={setFields} />
                  <div className="mt-5 flex gap-3">
                    <AdminButton variant="primary" disabled={disabled} onClick={saveFields}>
                      {working === "save" ? "Mentés…" : "Mentés"}
                    </AdminButton>
                    <AdminButton variant="ghost" disabled={disabled} onClick={() => setFields(null)}>
                      Mégse
                    </AdminButton>
                  </div>
                </div>
              ) : (
                <>
                  {view.editable ? (
                    <AdminDevotionalImagePanel
                      devotional={devotional}
                      onImageSelected={(updated) => {
                        setDevotional(updated);
                        void onChanged();
                      }}
                      onToast={onToast}
                    />
                  ) : (
                    devotional.imageUrl && (
                      <div className="px-5 pt-5 md:px-6">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={devotional.imageUrl}
                          alt=""
                          className="max-h-72 w-full rounded-2xl border border-ivory-200 object-cover"
                        />
                        {devotional.imageCredit && (
                          <p className="mt-1 text-[11px] text-ink-muted">Fotó: {devotional.imageCredit}</p>
                        )}
                      </div>
                    )
                  )}

                  <div className="mx-auto max-w-3xl p-6 md:p-10">
                    <DevotionalContent
                      content={devotional.content}
                      verse={devotional.verse}
                      title={devotional.title}
                    />

                    <section className="mt-10 rounded-2xl border border-ivory-200 bg-white p-5">
                      <h4 className="workshop-field-label">Facebook-ajánló</h4>
                      <p className="text-sm leading-relaxed text-ink">
                        {devotional.facebookCopy || "Nincs külön ajánló — a szöveg elejéből készül."}
                      </p>
                      <p className="mt-2 break-all text-[11px] text-ink-muted">
                        {getPublicDevotionalUrl(devotional.date)}
                      </p>
                      <div className="mt-4">
                        <CopyButton
                          text={facebookText}
                          label="Facebook szöveg másolása"
                          successLabel="Vágólapra másolva!"
                        />
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {refineOpen && devotional && (
        <AdminDevotionalRefineModal
          devotional={devotional}
          reviewOnly
          onClose={() => setRefineOpen(false)}
          onApplied={(updated) => {
            setDevotional(updated);
            onToast("Finomítva és mentve — ellenőrzésre vár.");
            void onChanged();
          }}
        />
      )}

      {confirmRegenerate && (
        <ConfirmDialog
          title="Áhítat újragenerálása"
          message="A Gemini új szöveget ír a terv alapján. A jelenlegi változat a verziótörténetben megmarad, a kézi szerkesztések azonban nem kerülnek át az újba."
          confirmLabel="Újragenerálás"
          loading={working === "regenerate"}
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={() => void regenerate()}
        />
      )}
    </article>
  );
}
