"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminErrorAlert, ConfirmDialog } from "@/components/admin/ui/AdminAlerts";
import { AdminPanel } from "@/components/admin/ui/AdminPanel";
import { WEEKDAY_NAMES_HU } from "@/lib/weekly-plan/prompts";
import type { WeeklyPlan, WeeklyPlanDay } from "@/lib/weekly-plan/types";
import { DAY_LABEL_HU, planStepState, type WeekOverview } from "@/lib/weekly-plan/ui-logic";
import { handToAutopilot, planAction, WorkshopApiError, type PlanActionResult } from "./workshop-api";

interface PlanStepProps {
  week: string;
  overview: WeekOverview;
  onChanged: () => Promise<void>;
  onToast: (message: string) => void;
  onNext: () => void;
}

type EditableDayFields = Pick<
  WeeklyPlanDay,
  "title" | "verse" | "role" | "category" | "excerpt"
> & { imageKeywords: string };

interface EditState {
  theme: string;
  arc: string;
  days: Record<string, EditableDayFields>;
}

const DAY_FIELDS: { key: keyof EditableDayFields; label: string; multiline?: boolean; wide?: boolean }[] = [
  { key: "title", label: "Cím" },
  { key: "category", label: "Kategória" },
  { key: "verse", label: "Igehely (hivatkozás — szöveg)", multiline: true, wide: true },
  { key: "role", label: "A nap szerepe az ívben", wide: true },
  { key: "excerpt", label: "Kivonat / Facebook-ajánló", multiline: true, wide: true },
  { key: "imageKeywords", label: "Képkulcsszavak (angolul)" },
];

function toEditState(plan: WeeklyPlan): EditState {
  return {
    theme: plan.theme,
    arc: plan.arc,
    days: Object.fromEntries(
      plan.days.map((d) => [
        d.date,
        {
          title: d.title,
          verse: d.verse,
          role: d.role,
          category: d.category,
          excerpt: d.excerpt,
          imageKeywords: d.imageKeywords ?? "",
        },
      ])
    ),
  };
}

function changedFields(plan: WeeklyPlan, edit: EditState) {
  const days = plan.days
    .map((d) => {
      const e = edit.days[d.date];
      const patch: Record<string, string> = { date: d.date };
      (["title", "verse", "role", "category", "excerpt"] as const).forEach((key) => {
        if (e[key] !== d[key]) patch[key] = e[key];
      });
      if (e.imageKeywords !== (d.imageKeywords ?? "")) patch.imageKeywords = e.imageKeywords;
      return Object.keys(patch).length > 1 ? patch : null;
    })
    .filter((p): p is Record<string, string> => p !== null);
  return {
    theme: edit.theme !== plan.theme ? edit.theme : undefined,
    arc: edit.arc !== plan.arc ? edit.arc : undefined,
    days,
  };
}

function messagesByDate(list: string[] | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const message of list ?? []) {
    const date = message.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    map.set(date, [...(map.get(date) ?? []), message.slice(12)]);
  }
  return map;
}

export function PlanStep({ week, overview, onChanged, onToast, onNext }: PlanStepProps) {
  const plan = overview.plan;
  const editable = overview.editable;

  const [mode, setMode] = useState<"gemini" | "import">("gemini");
  const [theme, setTheme] = useState("");
  const [brief, setBrief] = useState("");
  const [importText, setImportText] = useState("");
  const [showFormat, setShowFormat] = useState(false);
  const [unstructured, setUnstructured] = useState<string[] | null>(null);

  const [edit, setEdit] = useState<EditState | null>(plan ? toEditState(plan) : null);
  const [instruction, setInstruction] = useState("");
  const [instructions, setInstructions] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Set<string>>(new Set(plan?.repeatOverrides ?? []));

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<WorkshopApiError | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "reopen" | null>(null);

  // Új szerver-állapot (mentés, finomítás, frissítés után) → a szerkesztő mezők újratöltése.
  const planVersion = plan?.updatedAt;
  useEffect(() => {
    if (plan) {
      setEdit(toEditState(plan));
      setOverrides(new Set(plan.repeatOverrides ?? []));
    } else {
      setEdit(null);
    }
    // csak a terv új verziójánál töltünk újra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planVersion, week]);

  const isDraft = plan?.status === "draft";
  const locked = !plan || !isDraft || !editable;

  const changes = useMemo(
    () => (plan && edit ? changedFields(plan, edit) : null),
    [plan, edit]
  );
  const dirty = Boolean(
    changes && (changes.theme !== undefined || changes.arc !== undefined || changes.days.length > 0)
  );

  const stepState = useMemo(
    () =>
      planStepState(
        plan ? { ...plan, repeatOverrides: [...overrides] } : null,
        overview.issues
      ),
    [plan, overview.issues, overrides]
  );
  const errorsByDate = useMemo(() => messagesByDate(overview.issues?.errors), [overview.issues]);
  const warningsByDate = useMemo(() => messagesByDate(overview.issues?.warnings), [overview.issues]);
  const planLevelErrors = (overview.issues?.errors ?? []).filter(
    (e) => !/^\d{4}-\d{2}-\d{2}:/.test(e)
  );

  async function run<T>(label: string, task: () => Promise<T>, onSuccess?: (result: T) => void) {
    setBusy(label);
    setError(null);
    try {
      const result = await task();
      onSuccess?.(result);
      await onChanged();
    } catch (e) {
      const apiError =
        e instanceof WorkshopApiError ? e : new WorkshopApiError("Váratlan hiba történt.", 0);
      setError(apiError);
      if (apiError.code === "PLAN_CONFLICT") await onChanged();
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  function afterPlan(message: string) {
    return (result: PlanActionResult) => {
      const extra: string[] = [];
      if (result.repaired) extra.push("ismétlődő igehelyet cseréltünk");
      if (result.staleDates?.length) extra.push(`${result.staleDates.length} nap szövege elavult`);
      onToast(extra.length ? `${message} (${extra.join(", ")})` : message);
    };
  }

  const propose = (themeValue: string, briefValue: string) =>
    run(
      "propose",
      () => planAction("propose", week, { theme: themeValue, brief: briefValue }),
      afterPlan("A tervjavaslat elkészült.")
    );

  async function importThenHandle() {
    setBusy("import");
    setError(null);
    setUnstructured(null);
    try {
      const result = await planAction<PlanActionResult>("import", week, { text: importText });
      afterPlan("A terv betöltve.")(result);
      await onChanged();
    } catch (e) {
      if (e instanceof WorkshopApiError && e.code === "BRIEF_NOT_STRUCTURED") {
        setUnstructured(e.problems);
      } else {
        setError(e instanceof WorkshopApiError ? e : new WorkshopApiError("Váratlan hiba történt.", 0));
      }
    } finally {
      setBusy(null);
    }
  }

  // ── új terv ─────────────────────────────────────────────────────────────
  if (!plan || !edit) {
    return (
      <div className="space-y-6">
        {error && <ErrorBlock error={error} />}
        <AdminPanel
          title="Új heti terv"
          description="Indulhatsz rövid témából, kidolgozott szerkesztői briefből, vagy betöltheted a ChatGPT-ben elkészített strukturált tervet. A terv bármikor szerkeszthető és finomítható."
        >
          <div className="mb-5 flex gap-2" role="tablist">
            {(
              [
                ["gemini", "Tervjavaslat Geminivel"],
                ["import", "Strukturált terv importálása"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                className={`admin-editor-tab ${mode === id ? "admin-editor-tab-active" : ""}`}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "gemini" ? (
            <div className="space-y-4">
              <div>
                <label className="workshop-field-label" htmlFor="ws-theme">Rövid téma vagy irány</label>
                <input
                  id="ws-theme"
                  className="workshop-input"
                  value={theme}
                  maxLength={500}
                  placeholder="pl. Bizalom a bizonytalanságban"
                  onChange={(e) => setTheme(e.target.value)}
                  disabled={disabled || !editable}
                />
              </div>
              <div>
                <label className="workshop-field-label" htmlFor="ws-brief">
                  Szerkesztői brief (nem kötelező)
                </label>
                <textarea
                  id="ws-brief"
                  className="workshop-input min-h-[140px]"
                  value={brief}
                  maxLength={20000}
                  placeholder="Ide illeszthető a ChatGPT-ben kidolgozott, szabad szöveges brief: témák, kért igék, hangsúlyok, megkötések. A Gemini ebből dolgozza ki a tervet."
                  onChange={(e) => setBrief(e.target.value)}
                  disabled={disabled || !editable}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <AdminButton
                  variant="primary"
                  disabled={disabled || !editable || (!theme.trim() && !brief.trim())}
                  onClick={() => propose(theme, brief)}
                >
                  {busy === "propose" ? "A Gemini tervez…" : "Terv készítése"}
                </AdminButton>
                {busy === "propose" && (
                  <span className="text-xs text-ink-muted" role="status">
                    Ez kb. fél-egy percig tart. Ne zárd be az oldalt.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink-muted leading-relaxed">
                Illeszd be a ChatGPT-ben elkészített, strukturált tervet (JSON, vagy soronként
                <em> Hétfő | Cím | Igehely — szöveg | Szerep | Kategória | Kulcsszavak</em>). Ha a szöveg
                megfelel, Gemini-hívás nélkül betöltődik, és jóváhagyhatod.
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-gold-600 hover:underline"
                onClick={() => setShowFormat((v) => !v)}
              >
                {showFormat ? "Minta elrejtése" : "Elvárt formátum megtekintése"}
              </button>
              {showFormat && (
                <pre className="max-h-72 overflow-auto rounded-xl border border-ivory-200 bg-ivory-50/60 p-4 text-xs leading-relaxed text-ink">
                  {overview.briefFormat}
                </pre>
              )}
              <textarea
                className="workshop-input min-h-[220px] font-mono text-xs"
                value={importText}
                maxLength={20000}
                aria-label="Importálandó terv"
                placeholder='{ "theme": "…", "days": [ … 7 nap … ] }'
                onChange={(e) => {
                  setImportText(e.target.value);
                  setUnstructured(null);
                }}
                disabled={disabled || !editable}
              />
              {unstructured && (
                <div className="admin-alert admin-alert-warning" role="status">
                  <p className="admin-alert-title">A szöveg nem strukturált terv</p>
                  <ul className="admin-alert-message list-disc pl-5">
                    {unstructured.slice(0, 6).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <AdminButton
                      variant="regenerate"
                      disabled={disabled}
                      onClick={() => propose("", importText)}
                    >
                      Feldolgoztatás Geminivel (briefként)
                    </AdminButton>
                  </div>
                </div>
              )}
              <AdminButton
                variant="primary"
                disabled={disabled || !editable || !importText.trim()}
                onClick={importThenHandle}
              >
                {busy === "import" ? "Betöltés…" : "Terv betöltése"}
              </AdminButton>
            </div>
          )}
          {!editable && (
            <p className="mt-4 text-sm text-ink-muted">Ez a hét már lezárult — a terv nem módosítható.</p>
          )}
        </AdminPanel>
      </div>
    );
  }

  // ── meglévő terv ────────────────────────────────────────────────────────
  const setDay = (date: string, key: keyof EditableDayFields, value: string) =>
    setEdit({ ...edit, days: { ...edit.days, [date]: { ...edit.days[date], [key]: value } } });

  const toggleOverride = (date: string) => {
    const next = new Set(overrides);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    setOverrides(next);
  };

  const saveEdits = () =>
    run(
      "save",
      () =>
        planAction<PlanActionResult>("update", week, {
          expectedUpdatedAt: plan.updatedAt,
          ...changes,
        }),
      afterPlan("A módosítások mentve.")
    );

  const revise = () =>
    run(
      "revise",
      () =>
        planAction<PlanActionResult>("revise", week, {
          instruction,
          expectedUpdatedAt: plan.updatedAt,
        }),
      (result) => {
        setInstructions((list) => [instruction, ...list].slice(0, 5));
        setInstruction("");
        afterPlan("A terv finomítva.")(result);
      }
    );

  const approve = () =>
    run(
      "approve",
      () =>
        planAction<PlanActionResult>("approve", week, {
          expectedUpdatedAt: plan.updatedAt,
          overrideRepeats: [...overrides],
        }),
      () => onToast("A terv jóváhagyva — a napi áhítatok még nem készültek el, jöhet a generálás.")
    );

  const reopen = () =>
    run(
      "reopen",
      () => planAction<PlanActionResult>("reopen", week, { expectedUpdatedAt: plan.updatedAt }),
      () => onToast("A terv újra szerkeszthető.")
    );

  const giveToAutopilot = () =>
    run(
      "autopilot",
      () => handToAutopilot(week, plan.updatedAt),
      () => onToast("A terv átadva az autopilotnak: a hiányzó napokat ő pótolja és hagyja jóvá.")
    );

  const removeDraft = () =>
    run(
      "delete",
      () => planAction<{ deleted: boolean }>("delete", week, { expectedUpdatedAt: plan.updatedAt }),
      () => onToast("A vázlat törölve.")
    );

  const sourceLabel =
    plan.source === "auto"
      ? "Automatikus (autopilot, Gemini)"
      : plan.source === "gemini"
        ? "Gemini-javaslat"
        : plan.source === "brief"
          ? "Szerkesztői brief / import"
          : "Kézi";

  return (
    <div className="space-y-6">
      {error && <ErrorBlock error={error} onRefresh={onChanged} />}

      <AdminPanel
        title="A hét terve"
        description={`${sourceLabel} · ${isDraft ? "vázlat" : "jóváhagyva"}`}
        action={
          isDraft ? (
            <span className="admin-chip">Vázlat</span>
          ) : (
            <span className="admin-chip admin-chip-success">Terv jóváhagyva</span>
          )
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="workshop-field-label" htmlFor="ws-plan-theme">A hét témája</label>
            <input
              id="ws-plan-theme"
              className="workshop-input"
              value={edit.theme}
              maxLength={200}
              disabled={locked || disabled}
              onChange={(e) => setEdit({ ...edit, theme: e.target.value })}
            />
          </div>
          <div className="md:row-span-1">
            <label className="workshop-field-label" htmlFor="ws-plan-arc">Gondolati ív</label>
            <textarea
              id="ws-plan-arc"
              className="workshop-input min-h-[88px]"
              value={edit.arc}
              maxLength={1500}
              disabled={locked || disabled}
              onChange={(e) => setEdit({ ...edit, arc: e.target.value })}
            />
          </div>
        </div>

        {planLevelErrors.length > 0 && (
          <ul className="mt-4 list-disc pl-5 text-sm text-red-800">
            {planLevelErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <div className="space-y-4">
        {plan.days.map((day, i) => {
          const e = edit.days[day.date];
          const dayErrors = errorsByDate.get(day.date) ?? [];
          const dayWarnings = warningsByDate.get(day.date) ?? [];
          const isRepeat = stepState.repeatDates.includes(day.date);
          const overridden = overrides.has(day.date);
          const blocking = dayErrors.filter(
            (m) => !(m.includes("már szerepelt") && overridden)
          );
          return (
            <article
              key={day.date}
              className={`workshop-day-row ${blocking.length > 0 ? "workshop-day-row-warn" : ""}`}
            >
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-serif text-lg font-semibold text-ink">
                  {WEEKDAY_NAMES_HU[i]} <span className="font-sans text-xs font-normal text-ink-muted">{day.date}</span>
                </h3>
                {day.state !== "planned" && (
                  <span className="admin-chip">{stateChip(day.state)}</span>
                )}
              </header>

              <div className="grid gap-3 md:grid-cols-2">
                {DAY_FIELDS.map((f) => (
                  <div key={f.key} className={f.wide ? "md:col-span-2" : ""}>
                    <label className="workshop-field-label" htmlFor={`ws-${day.date}-${f.key}`}>
                      {f.label}
                    </label>
                    {f.multiline ? (
                      <textarea
                        id={`ws-${day.date}-${f.key}`}
                        className="workshop-input min-h-[64px]"
                        value={e[f.key]}
                        disabled={locked || disabled}
                        onChange={(ev) => setDay(day.date, f.key, ev.target.value)}
                      />
                    ) : (
                      <input
                        id={`ws-${day.date}-${f.key}`}
                        className="workshop-input"
                        value={e[f.key]}
                        disabled={locked || disabled}
                        onChange={(ev) => setDay(day.date, f.key, ev.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {(dayErrors.length > 0 || dayWarnings.length > 0) && (
                <ul className="mt-3 space-y-1 text-xs">
                  {dayErrors.map((m) => (
                    <li key={m} className={m.includes("már szerepelt") && overridden ? "text-amber-800" : "text-red-800"}>
                      ⚠ {m}
                    </li>
                  ))}
                  {dayWarnings.map((m) => (
                    <li key={m} className="text-amber-800">• {m}</li>
                  ))}
                </ul>
              )}

              {isRepeat && isDraft && editable && (
                <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={overridden}
                    disabled={disabled}
                    onChange={() => toggleOverride(day.date)}
                  />
                  <span>
                    <strong>Szerkesztői döntés:</strong> az igehely a 90 napon belül már szerepelt, de
                    ezen a napon tudatosan megtartom.
                  </span>
                </label>
              )}
            </article>
          );
        })}
      </div>

      {isDraft && editable && dirty && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/50 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
          <p className="text-sm font-medium text-ink">Nem mentett módosítások</p>
          <div className="flex gap-2">
            <AdminButton variant="ghost" disabled={disabled} onClick={() => setEdit(toEditState(plan))}>
              Elvetés
            </AdminButton>
            <AdminButton variant="primary" disabled={disabled} onClick={saveEdits}>
              {busy === "save" ? "Mentés…" : "Módosítások mentése"}
            </AdminButton>
          </div>
        </div>
      )}

      {isDraft && editable && (
        <AdminPanel
          title="Finomítás utasítással"
          description="Írd le természetes nyelven, mit módosítson a Gemini. A jelenlegi tervből indul ki; amit nem érint az utasítás, az változatlan marad."
        >
          <textarea
            className="workshop-input min-h-[88px]"
            value={instruction}
            maxLength={2000}
            aria-label="Módosítási utasítás"
            placeholder="pl. A csütörtök legyen a bölcsességről, és a hét végére kerüljön hangsúlyosabban a hála."
            onChange={(e) => setInstruction(e.target.value)}
            disabled={disabled || dirty}
          />
          {dirty && (
            <p className="mt-2 text-xs text-amber-800">
              Előbb mentsd (vagy vesd el) a kézi módosításokat, hogy a finomítás ne írja felül őket.
            </p>
          )}
          {instructions.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink-muted">
              {instructions.map((text) => (
                <li key={text}>
                  <button
                    type="button"
                    className="text-left hover:text-ink hover:underline"
                    onClick={() => setInstruction(text)}
                  >
                    ↺ {text.length > 110 ? `${text.slice(0, 110)}…` : text}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AdminButton
              variant="regenerate"
              disabled={disabled || dirty || !instruction.trim()}
              onClick={revise}
            >
              {busy === "revise" ? "A Gemini dolgozik…" : "Terv finomítása"}
            </AdminButton>
            <AdminButton variant="ghost" disabled={disabled} onClick={() => setConfirm("delete")}>
              Vázlat elvetése
            </AdminButton>
          </div>
        </AdminPanel>
      )}

      <AdminPanel title="Jóváhagyás">
        {isDraft ? (
          <>
            {stepState.blockers.length > 0 ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
                <p className="text-sm font-semibold text-red-900">A terv még nem hagyható jóvá:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
                  {stepState.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mb-4 text-sm text-ink-muted">
                Ellenőrizd a témát, az ívet és a hét igehelyeit. A terv jóváhagyása a napi szövegek
                generálásának előfeltétele; az igehelyek bekerülnek a 90 napos nyilvántartásba.
                <strong> Nem jelenti</strong>, hogy az áhítatok elkészültek vagy publikálásra készek — azokat
                külön kell legenerálni és jóváhagyni.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <AdminButton
                variant="publish"
                disabled={disabled || dirty || !editable || stepState.blockers.length > 0}
                onClick={approve}
              >
                {busy === "approve" ? "Jóváhagyás…" : "Terv jóváhagyása"}
              </AdminButton>
              {dirty && <span className="text-xs text-amber-800">Előbb mentsd a módosításokat.</span>}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="basis-full text-sm text-ink-muted">
              A terv jóváhagyva. A hét <strong>még nem publikálásra kész</strong>: a napi áhítatokat
              le kell generálni, majd egyenként vagy együtt jóvá kell hagyni.
            </p>
            <AdminButton variant="primary" onClick={onNext}>
              Tovább az áhítatok generálásához →
            </AdminButton>
            <AdminButton variant="ghost" disabled={disabled || !editable} onClick={() => setConfirm("reopen")}>
              Visszanyitás szerkesztésre
            </AdminButton>
            {plan.source !== "auto" && (
              <AdminButton variant="ghost" disabled={disabled || !editable} onClick={giveToAutopilot}>
                {busy === "autopilot" ? "Átadás…" : "Átadás az autopilotnak"}
              </AdminButton>
            )}
            {plan.source === "auto" && (
              <p className="basis-full text-xs text-ink-muted">
                Ezt a tervet az autopilot készítette. Ha visszanyitod és szerkeszted, kézi tervvé válik, és az
                autopilot nem nyúl hozzá, amíg vissza nem adod neki.
              </p>
            )}
          </div>
        )}
      </AdminPanel>

      {confirm === "delete" && (
        <ConfirmDialog
          title="Vázlat elvetése"
          message="A vázlat törlődik, és új tervet kezdhetsz. Ez csak akkor lehetséges, ha még nincs elkészült nap."
          confirmLabel="Vázlat törlése"
          loading={busy === "delete"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void removeDraft();
          }}
        />
      )}
      {confirm === "reopen" && (
        <ConfirmDialog
          title="Visszanyitás szerkesztésre"
          message="A jóváhagyott terv újra vázlat lesz. Ha megváltoztatsz egy napot, annak már elkészült szövege elavult lesz, és újra kell generálni. Az autopilot által készített terv ezzel kézi tervvé válik: az autopilot nem nyúl hozzá, amíg vissza nem adod neki."
          confirmLabel="Visszanyitás"
          loading={busy === "reopen"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void reopen();
          }}
        />
      )}
    </div>
  );
}

function stateChip(state: WeeklyPlanDay["state"]): string {
  switch (state) {
    case "ready":
      return DAY_LABEL_HU.review.replace("Ellenőrzésre vár", "Szöveg kész");
    case "stale":
      return DAY_LABEL_HU.stale;
    case "failed":
      return DAY_LABEL_HU.failed;
    case "generating":
      return DAY_LABEL_HU.generating;
    default:
      return "Tervezett";
  }
}

function ErrorBlock({
  error,
  onRefresh,
}: {
  error: WorkshopApiError;
  onRefresh?: () => Promise<void>;
}) {
  const conflict = error.code === "PLAN_CONFLICT";
  return (
    <div>
      <AdminErrorAlert
        title={conflict ? "A terv időközben megváltozott" : "A művelet nem sikerült"}
        message={error.message}
        hint={
          conflict
            ? "A friss állapotot betöltöttük; nézd át a változást, és ismételd meg a módosítást."
            : error.problems.length
              ? error.problems.slice(0, 4).join(" ")
              : undefined
        }
        variant={error.status >= 500 ? "error" : "warning"}
      />
      {onRefresh && conflict && (
        <div className="mt-2">
          <AdminButton size="sm" onClick={() => void onRefresh()}>
            Frissítés
          </AdminButton>
        </div>
      )}
    </div>
  );
}
