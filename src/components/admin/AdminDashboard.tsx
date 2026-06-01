"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DevotionalContent } from "@/components/devotional/DevotionalContent";
import { AdminDevotionalList } from "@/components/admin/AdminDevotionalList";
import { AdminDevotionalImagePanel } from "@/components/admin/AdminDevotionalImagePanel";
import {
  AdminDevotionalEditor,
  initEditableFields,
} from "@/components/admin/AdminDevotionalEditor";
import { AdminShell, AdminMain } from "@/components/admin/ui/AdminShell";
import { AdminHeader } from "@/components/admin/ui/AdminHeader";
import { AdminStatCard } from "@/components/admin/ui/AdminStatCard";
import { AdminPanel } from "@/components/admin/ui/AdminPanel";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminStatusBadge } from "@/components/admin/ui/AdminStatusBadge";
import { AdminDevotionalRefineModal } from "@/components/admin/AdminDevotionalRefineModal";
import {
  AdminErrorAlert,
  AdminToast,
  ConfirmDialog,
} from "@/components/admin/ui/AdminAlerts";
import type {
  AdminDevotionalContext,
  AdminDevotionalListItem,
  Devotional,
} from "@/lib/types";
import type { EditableDevotionalFields } from "@/lib/devotional-fields";
import type { DevotionalMemory } from "@/lib/devotional-memory";
import { statusLabelHu } from "@/lib/devotional-status";
import { CopyButton } from "@/components/CopyButton";
import { formatDevotionalForFacebook, getPublicDevotionalUrl } from "@/lib/facebook";
import { getGeminiErrorTitle } from "@/lib/gemini-error-labels";
import { useGeminiLoadingMessage } from "@/hooks/useGeminiLoadingMessage";

interface AdminDashboardProps {
  memory: DevotionalMemory;
  latestDevotional: Devotional | null;
  adminContext: AdminDevotionalContext;
  initialListItems: AdminDevotionalListItem[];
  initialDevotionals: Devotional[];
  storageError?: string | null;
  storageHint?: string | null;
}

interface ApiErrorPayload {
  error?: string;
  hint?: string;
  code?: string;
  tlsMode?: string;
  isDevelopment?: boolean;
}

interface PingResult {
  ok: boolean;
  tlsMode?: string;
  keyConfigured?: boolean;
  sample?: string;
  error?: string;
  hint?: string;
  code?: string;
}

export function AdminDashboard({
  memory,
  latestDevotional: initialLatest,
  adminContext,
  initialListItems,
  initialDevotionals,
  storageError: initialStorageError,
  storageHint: initialStorageHint,
}: AdminDashboardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [todayCronLoading, setTodayCronLoading] = useState(false);
  const [todayCronNotice, setTodayCronNotice] = useState<string | null>(null);
  const [regenerateLoading, setRegenerateLoading] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [context, setContext] = useState(adminContext);
  const [listItems, setListItems] = useState(initialListItems);
  const [devotionalsByDay, setDevotionalsByDay] = useState(() => {
    const map = new Map<number, Devotional>();
    for (const d of initialDevotionals) map.set(d.dayNumber, d);
    return map;
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(
    initialLatest?.dayNumber ?? initialListItems[0]?.dayNumber ?? null
  );
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<EditableDevotionalFields | null>(null);
  const [confirmRegenerateDay, setConfirmRegenerateDay] = useState<number | null>(null);
  const [refineDay, setRefineDay] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const geminiLoadingActive =
    loading || todayCronLoading || regenerateLoading !== null;
  const geminiLoadingMessage = useGeminiLoadingMessage(geminiLoadingActive);

  const preview = selectedDay != null ? devotionalsByDay.get(selectedDay) ?? null : null;

  const mergeDevotional = useCallback((d: Devotional) => {
    setDevotionalsByDay((prev) => new Map(prev).set(d.dayNumber, d));
    setListItems((prev) => {
      const item: AdminDevotionalListItem = {
        dayNumber: d.dayNumber,
        date: d.date,
        title: d.title,
        verse: d.verse,
        status: d.status ?? "published",
        generatedAt: d.generatedAt,
        updatedAt: d.updatedAt,
        editedByAdmin: d.editedByAdmin,
        category: d.category,
      };
      const idx = prev.findIndex((i) => i.dayNumber === d.dayNumber);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next.sort((a, b) => b.dayNumber - a.dayNumber);
      }
      return [item, ...prev].sort((a, b) => b.dayNumber - a.dayNumber);
    });
  }, []);

  const refreshFromServer = useCallback(async () => {
    const res = await fetch("/api/admin/devotionals");
    if (!res.ok) return;
    const data = (await res.json()) as {
      items: AdminDevotionalListItem[];
      devotionals: Devotional[];
    };
    setListItems(data.items);
    const map = new Map<number, Devotional>();
    for (const d of data.devotionals) map.set(d.dayNumber, d);
    setDevotionalsByDay(map);
  }, []);

  const selectDay = useCallback((dayNumber: number) => {
    setSelectedDay(dayNumber);
    setEditMode(false);
    setEditFields(null);
    setError(null);
  }, []);

  const enterEditMode = useCallback(
    (dayNumber: number) => {
      const d = devotionalsByDay.get(dayNumber);
      if (!d) return;
      setSelectedDay(dayNumber);
      setEditFields(initEditableFields(d));
      setEditMode(true);
      setError(null);
    },
    [devotionalsByDay]
  );

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

  async function handlePing() {
    setPingLoading(true);
    setPingResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/gemini-ping");
      const data = (await res.json()) as PingResult;

      if (!res.ok || !data.ok) {
        setPingResult({ ...data, ok: false });
        return;
      }

      setPingResult(data);
    } catch {
      setPingResult({
        ok: false,
        error: "Nem sikerült elérni a teszt végpontot.",
        hint: "Ellenőrizd, hogy a dev szerver fut-e.",
      });
    } finally {
      setPingLoading(false);
    }
  }

  async function handleGenerateTodayCron() {
    setTodayCronLoading(true);
    setError(null);
    setToast(null);
    setTodayCronNotice(null);

    try {
      const res = await fetch("/api/cron/generate-devotional", { method: "POST" });
      const data = (await res.json()) as ApiErrorPayload & {
        success?: boolean;
        skipped?: boolean;
        created?: boolean;
        message?: string;
        devotional?: {
          dayNumber: number;
          date: string;
          title: string;
          status?: string;
        };
      };

      if (!res.ok || !data.success) {
        const friendlyError =
          data.code === "GEMINI_OVERLOAD"
            ? (data.hint ??
              "A Gemini szervere átmenetileg túlterhelt. Automatikus újrapróbák után sem sikerült — várj 1–2 percet.")
            : data.code
              ? `${getGeminiErrorTitle(data.code)}. Próbáld újra később, vagy ellenőrizd az API beállításokat.`
              : (data.error ?? "A mai áhítat generálása sikertelen.");
        setError({
          error: friendlyError,
          hint:
            data.hint ??
            (data.code === "GEMINI_OVERLOAD"
              ? "A szerver 3× automatikusan újrapróbálta (3 s, 8 s, 15 s várakozással)."
              : data.code === "NETWORK" || data.code === "TLS_CERTIFICATE"
                ? "Ellenőrizd a hálózati kapcsolatot, majd próbáld újra."
                : data.code === "API_KEY"
                  ? "Ellenőrizd a GEMINI_API_KEY környezeti változót."
                  : data.code
                    ? "Ha a hiba tartós, nézd meg a szerver naplókat."
                    : undefined),
          code: data.code,
        });
        return;
      }

      if (data.skipped) {
        setTodayCronNotice(
          data.message ??
            "A mai napra már van áhítat. Használd az újragenerálás gombot, ha módosítani szeretnéd."
        );
        if (data.devotional?.dayNumber) {
          await refreshFromServer();
          selectDay(data.devotional.dayNumber);
        }
        return;
      }

      await refreshFromServer();
      if (data.devotional?.dayNumber) {
        selectDay(data.devotional.dayNumber);
      }
      setToast("A mai áhítat elkészült és publikálva lett.");
    } catch {
      setError({
        error: "Hálózati hiba történt a generálás során.",
        hint: "A böngésző nem tudta elérni a szervert. Ellenőrizd a kapcsolatot, majd próbáld újra.",
        code: "NETWORK",
      });
    } finally {
      setTodayCronLoading(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setToast(null);

    try {
      const res = await fetch("/api/generate", { method: "POST" });
      const data = (await res.json()) as ApiErrorPayload & {
        devotional?: Devotional;
        adminContext?: AdminDevotionalContext;
      };

      if (!res.ok) {
        setError({
          error:
            data.code === "DUPLICATE_VERSE"
              ? (data.error ??
                "Nem sikerült új, még nem használt igerészt választani. Kérlek próbáld újra.")
              : data.code === "GEMINI_OVERLOAD"
              ? (data.hint ?? data.error ?? "A Gemini átmenetileg túlterhelt.")
              : (data.error ?? "Generálás sikertelen."),
          hint: data.hint,
          code: data.code,
          tlsMode: data.tlsMode,
          isDevelopment: data.isDevelopment,
        });
        return;
      }

      if (data.devotional) {
        mergeDevotional(data.devotional);
        selectDay(data.devotional.dayNumber);
        const d = data.devotional;
        const imageNote =
          d.imageUrl && (d.imageSource === "pexels_auto" || d.imageSource === "pexels")
            ? " · Pexels kép hozzárendelve"
            : d.imageUrl
              ? " · Kép mentve"
              : " · Alapértelmezett fallback kép";
        setToast(`Generálva: ${d.dayNumber}. nap${imageNote}`);
      }
      if (data.adminContext) {
        setContext(data.adminContext);
      }
    } catch {
      setError({
        error: "Hálózati hiba történt a generálás során.",
        hint: "A böngésző nem tudta elérni a szervert.",
        code: "NETWORK",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate(dayNumber: number) {
    setRegenerateLoading(dayNumber);
    setError(null);
    setConfirmRegenerateDay(null);

    try {
      const res = await fetch("/api/admin/devotional/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayNumber, backup: true }),
      });

      const data = (await res.json()) as ApiErrorPayload & {
        devotional?: Devotional;
        backedUp?: boolean;
        adminContext?: AdminDevotionalContext;
      };

      if (!res.ok) {
        setError({
          error:
            data.code === "DUPLICATE_VERSE"
              ? (data.error ??
                "Nem sikerült új, még nem használt igerészt választani. Kérlek próbáld újra.")
              : data.code === "GEMINI_OVERLOAD"
              ? (data.hint ?? data.error ?? "A Gemini átmenetileg túlterhelt.")
              : (data.error ?? "Újragenerálás sikertelen."),
          hint: data.hint,
          code: data.code,
        });
        return;
      }

      if (data.devotional) {
        mergeDevotional(data.devotional);
        selectDay(data.devotional.dayNumber);
        if (editMode) {
          setEditFields(initEditableFields(data.devotional));
        }
        setToast(
          data.backedUp
            ? `${dayNumber}. nap újragenerálva (előző verzió mentve).`
            : `${dayNumber}. nap újragenerálva.`
        );
      }
      if (data.adminContext) {
        setContext(data.adminContext);
      }
    } catch {
      setError({ error: "Hálózati hiba az újragenerálás során.", code: "NETWORK" });
    } finally {
      setRegenerateLoading(null);
    }
  }

  async function handleAdminAction(
    action: "save" | "save_draft" | "approve" | "publish" | "revert_draft",
    fields?: EditableDevotionalFields
  ) {
    if (!preview) return;

    setActionLoading(action);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        dayNumber: preview.dayNumber,
        action,
      };
      if (fields && (action === "save" || action === "save_draft")) {
        body.fields = fields;
      }

      const res = await fetch("/api/admin/devotional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as ApiErrorPayload & {
        devotional?: Devotional;
      };

      if (!res.ok) {
        setError({ error: data.error ?? "Művelet sikertelen." });
        return;
      }

      if (data.devotional) {
        mergeDevotional(data.devotional);
        if (action === "save" || action === "save_draft") {
          setEditFields(initEditableFields(data.devotional));
        }
        const labels: Record<string, string> = {
          save: "Mentve",
          save_draft: "Piszkozatként mentve",
          approve: "Jóváhagyva",
          publish: "Közzétéve",
          revert_draft: "Visszavonva piszkozatba",
        };
        setToast(labels[action] ?? "Kész");
      }
    } catch {
      setError({ error: "Hálózati hiba a művelet során.", code: "NETWORK" });
    } finally {
      setActionLoading(null);
    }
  }

  const facebookText = preview
    ? formatDevotionalForFacebook(
        preview,
        getPublicDevotionalUrl(
          preview.dayNumber,
          typeof window !== "undefined" ? window.location.origin : undefined
        )
      )
    : "";

  const recentCategories = memory.usedCategories.slice(-5).join(" → ") || "—";
  const target = context.generationTarget;

  const generateLabel = useMemo(() => {
    if (target.action === "blocked") return "Generálás blokkolva";
    if (target.action === "update") {
      return "Már van tartalom — újragenerálás szükséges";
    }
    return context.devReviewMode
      ? "Mai áhítat generálása"
      : "Következő nap generálása";
  }, [context.devReviewMode, target.action]);

  const geminiStatValue = pingResult?.ok
    ? "Kapcsolat rendben"
    : pingResult && !pingResult.ok
      ? "Hiba"
      : "Nincs teszt";

  const currentStatusLabel = preview
    ? statusLabelHu(preview.status ?? "draft")
    : target.action === "create"
      ? "Új nap"
      : "—";

  return (
    <AdminShell>
      <AdminHeader
        model={context.model}
        context={context}
        publishedCount={memory.totalPublished}
        preview={preview}
        onLogout={handleLogout}
      />

      <AdminMain>
        {initialStorageError && (
          <AdminErrorAlert
            title="Production tároló nincs beállítva"
            message={initialStorageError}
            hint={initialStorageHint ?? undefined}
            meta="STORAGE_NOT_CONFIGURED"
          />
        )}

        {context.reviewWarning && (
          <AdminErrorAlert
            title="Generálás figyelmeztetés"
            message={context.reviewWarning}
          />
        )}

        {context.devReviewMode && (
          <div className="admin-banner-dev">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900 mb-1">
              Fejlesztői ellenőrzési mód
            </p>
            {context.reviewWarning ? null : (
              <>
                Csak a mai / aktuális áhítat finomítható. Jóváhagyásig nincs
                következő nap.
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          <AdminStatCard
            label="Auto publish"
            value={context.autoPublishGenerated ? "Bekapcsolva" : "Kikapcsolva"}
            accent={context.autoPublishGenerated ? "success" : "muted"}
          />
          <AdminStatCard
            label="Auto generate"
            value={context.autoGenerateDaily ? "Igen" : "Nem"}
          />
          <AdminStatCard
            label="Cron"
            value={context.cronEnabled ? "Aktív" : "Inaktív"}
            accent={context.cronEnabled ? "success" : "muted"}
          />
          <AdminStatCard
            label="Prompt verzió"
            value={
              <span className="font-mono text-sm font-medium truncate block">
                {context.promptVersion}
              </span>
            }
          />
          <AdminStatCard
            label="Gemini"
            value={geminiStatValue}
            hint={context.model}
            accent={pingResult?.ok ? "success" : pingResult && !pingResult.ok ? "warning" : "default"}
          />
          <AdminStatCard
            label="Aktuális státusz"
            value={currentStatusLabel}
            hint={preview ? `${preview.dayNumber}. nap` : `${target.dayNumber}. nap cél`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-8">
            <AdminPanel
              title="Generálás"
              description={
                context.devReviewMode
                  ? "Aktuális generálási cél"
                  : "Következő generálandó nap"
              }
            >
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="font-serif text-4xl font-semibold text-ink tracking-tight">
                    {target.dayNumber}. nap
                  </p>
                  <p className="text-sm text-ink-muted mt-1">{target.date}</p>
                  <p className="text-sm text-gold-700/90 mt-4 font-medium">
                    Utóbbi témák: {recentCategories}
                  </p>
                </div>
                <AdminButton
                  variant="primary"
                  size="lg"
                  onClick={handleGenerate}
                  disabled={
                    loading ||
                    pingLoading ||
                    target.action === "blocked" ||
                    target.action === "update"
                  }
                  className="min-w-[200px]"
                >
                  {loading ? "Generálás…" : generateLabel}
                </AdminButton>
              </div>

              {loading && (
                <p className="mt-5 text-sm text-ink-muted" role="status" aria-live="polite">
                  {geminiLoadingMessage}
                </p>
              )}

              {target.action === "update" && (
                <p className="mt-4 text-sm text-ink-muted rounded-xl bg-ivory-50 border border-ivory-200 px-4 py-3">
                  Erre a napra már van áhítat. Válaszd ki a táblázatból, és használd
                  az „Újragenerálás” gombot.
                </p>
              )}

              {target.blockedReason && (
                <p className="mt-4 text-sm text-amber-900 rounded-xl bg-amber-50 border border-amber-200/70 px-4 py-3">
                  {target.blockedReason}
                </p>
              )}

              <div className="mt-8 pt-6 border-t border-ivory-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
                  Cron manuális indítás
                </p>
                <p className="text-sm text-ink-muted mb-4">
                  Ha éjfél után a cron még nem futott le, itt elindíthatod a mai nap
                  automatikus generálását (Gemini + Pexels, published státusz).
                </p>
                <AdminButton
                  variant="default"
                  onClick={handleGenerateTodayCron}
                  disabled={
                    todayCronLoading ||
                    loading ||
                    pingLoading ||
                    regenerateLoading !== null
                  }
                  className="min-w-[240px]"
                >
                  {todayCronLoading
                    ? "Generálás folyamatban…"
                    : "Mai áhítat generálása most"}
                </AdminButton>

                {todayCronLoading && (
                  <p className="mt-4 text-sm text-ink-muted" role="status" aria-live="polite">
                    {geminiLoadingMessage}
                  </p>
                )}

                {todayCronNotice && (
                  <p className="mt-4 text-sm text-ink-muted rounded-xl bg-ivory-50 border border-ivory-200 px-4 py-3">
                    {todayCronNotice}
                  </p>
                )}
              </div>
            </AdminPanel>
          </div>

          <div className="lg:col-span-4">
            <AdminPanel title="Gemini kapcsolat">
              <AdminButton
                variant="default"
                className="w-full"
                onClick={handlePing}
                disabled={pingLoading || loading}
              >
                {pingLoading ? "Tesztelés…" : "API kapcsolat tesztelése"}
              </AdminButton>

              {pingResult?.ok && (
                <p className="mt-4 text-sm text-emerald-800 bg-emerald-50/80 rounded-xl px-4 py-3 border border-emerald-200/60">
                  Kapcsolat rendben
                  {pingResult.sample ? (
                    <span className="block mt-1 text-emerald-700/90 italic font-serif">
                      „{pingResult.sample}”
                    </span>
                  ) : null}
                </p>
              )}

              {pingResult && !pingResult.ok && (
                <div className="mt-4">
                  <AdminErrorAlert
                    title={getGeminiErrorTitle(pingResult.code)}
                    message={pingResult.error ?? "Ismeretlen hiba."}
                    hint={pingResult.hint}
                    meta={[pingResult.code, pingResult.tlsMode].filter(Boolean).join(" · ")}
                  />
                </div>
              )}
            </AdminPanel>
          </div>
        </div>

        {geminiLoadingActive && !error && (
          <p
            className="mb-6 text-sm text-ink-muted rounded-xl bg-ivory-50 border border-ivory-200 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            {geminiLoadingMessage}
          </p>
        )}

        {error && (
          <AdminErrorAlert
            title={
              error.code === "GENERATION_BLOCKED"
                ? "Generálás blokkolva"
                : getGeminiErrorTitle(error.code)
            }
            message={error.error ?? "Ismeretlen hiba."}
            hint={error.hint}
            meta={[error.code, error.tlsMode].filter(Boolean).join(" · ")}
          />
        )}

        {toast && <AdminToast message={toast} />}

        <AdminPanel
          title="Napi áhítatok"
          description={`${listItems.length} rekord`}
          action={
            <AdminButton variant="ghost" size="sm" onClick={() => refreshFromServer()}>
              Frissítés
            </AdminButton>
          }
          noPadding
        >
          <div className="px-2 pb-2">
            <AdminDevotionalList
              items={listItems}
              selectedDayNumber={selectedDay}
              onSelect={selectDay}
              onEdit={enterEditMode}
              onRegenerate={(day) => setConfirmRegenerateDay(day)}
              onRefine={(day) => setRefineDay(day)}
              onPublish={(day) => {
                selectDay(day);
                handleAdminAction("publish");
              }}
              loadingDay={regenerateLoading}
            />
          </div>
        </AdminPanel>

        {preview && (
          <AdminPanel noPadding className="overflow-hidden">
            <div className="admin-preview-hero">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="editorial-eyebrow">
                    {editMode ? "Szerkesztő" : "Előnézet"} · {preview.date}
                  </p>
                  <h2 className="font-serif text-2xl md:text-3xl font-semibold text-ink mt-2 tracking-tight leading-snug">
                    {preview.dayNumber}. nap —{" "}
                    {editMode && editFields ? editFields.title : preview.title}
                  </h2>
                  {preview.category && (
                    <p className="mt-2 text-sm text-gold-600/90">{preview.category}</p>
                  )}
                </div>
                {preview.status && <AdminStatusBadge status={preview.status} />}
              </div>

              <dl className="admin-preview-meta">
                <div>
                  <dt>Generálva</dt>
                  <dd>
                    {preview.generatedAt
                      ? new Date(preview.generatedAt).toLocaleString("hu-HU")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Módosítva</dt>
                  <dd>
                    {preview.updatedAt
                      ? new Date(preview.updatedAt).toLocaleString("hu-HU")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Karakterhossz</dt>
                  <dd>{preview.contentCharCount ?? preview.content.length}</dd>
                </div>
                <div>
                  <dt>Verziók</dt>
                  <dd>{preview.versionHistory?.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Prompt</dt>
                  <dd className="font-mono text-xs truncate">
                    {preview.promptVersion ?? context.promptVersion}
                  </dd>
                </div>
              </dl>

              {preview.editedByAdmin && (
                <p className="mt-4 text-xs font-medium text-gold-700">
                  Admin által kézzel szerkesztve
                </p>
              )}
            </div>

            <div className="admin-toolbar">
              {!editMode ? (
                <>
                  <AdminButton variant="edit" onClick={() => enterEditMode(preview.dayNumber)}>
                    Szerkesztés
                  </AdminButton>
                  <AdminButton
                    variant="regenerate"
                    onClick={() => setConfirmRegenerateDay(preview.dayNumber)}
                    disabled={regenerateLoading !== null}
                  >
                    Újragenerálás
                  </AdminButton>
                  <AdminButton
                    variant="default"
                    onClick={() => setRefineDay(preview.dayNumber)}
                    disabled={regenerateLoading !== null}
                  >
                    AI finomítás
                  </AdminButton>
                  <AdminButton
                    variant="default"
                    onClick={() => handleAdminAction("approve")}
                    disabled={
                      actionLoading !== null ||
                      preview.status === "approved" ||
                      preview.status === "published"
                    }
                  >
                    {actionLoading === "approve" ? "…" : "Jóváhagyás"}
                  </AdminButton>
                  <AdminButton
                    variant="publish"
                    onClick={() => handleAdminAction("publish")}
                    disabled={actionLoading !== null || preview.status === "published"}
                  >
                    {actionLoading === "publish" ? "…" : "Közzététel"}
                  </AdminButton>
                  {preview.status === "published" && (
                    <AdminButton
                      variant="danger"
                      onClick={() => handleAdminAction("revert_draft")}
                      disabled={actionLoading !== null}
                    >
                      {actionLoading === "revert_draft" ? "…" : "Visszavonás piszkozatba"}
                    </AdminButton>
                  )}
                </>
              ) : (
                <>
                  <AdminButton
                    variant="primary"
                    onClick={() => editFields && handleAdminAction("save", editFields)}
                    disabled={actionLoading !== null || !editFields}
                  >
                    {actionLoading === "save" ? "Mentés…" : "Mentés"}
                  </AdminButton>
                  <AdminButton
                    variant="default"
                    onClick={() => editFields && handleAdminAction("save_draft", editFields)}
                    disabled={actionLoading !== null || !editFields}
                  >
                    {actionLoading === "save_draft" ? "…" : "Piszkozat mentése"}
                  </AdminButton>
                  <AdminButton
                    variant="ghost"
                    onClick={() => {
                      setEditMode(false);
                      setEditFields(null);
                    }}
                  >
                    Mégse
                  </AdminButton>
                </>
              )}
            </div>

            {editMode && editFields ? (
              <div className="p-5 md:p-8 bg-[#faf9f6]/50">
                <AdminDevotionalEditor fields={editFields} onChange={setEditFields} />
              </div>
            ) : (
              <>
                <AdminDevotionalImagePanel
                  devotional={preview}
                  onImageSelected={mergeDevotional}
                  onToast={setToast}
                />

                <div className="p-6 md:p-10 max-w-3xl mx-auto">
                  <DevotionalContent content={preview.content} verse={preview.verse} title={preview.title} />

                  <div className="mt-10 pt-8 border-t border-ivory-200 flex justify-center">
                    <CopyButton
                      text={facebookText}
                      label="Facebook szöveg másolása"
                      successLabel="Vágólapra másolva!"
                    />
                  </div>
                </div>
              </>
            )}
          </AdminPanel>
        )}

        {confirmRegenerateDay != null && (
          <ConfirmDialog
            title="Újragenerálás megerősítése"
            message="Biztosan újragenerálod? A jelenlegi tartalom felülíródik. Az előző verzió mentésre kerül a verziótörténetbe."
            confirmLabel="Igen, újragenerálás"
            loading={regenerateLoading === confirmRegenerateDay}
            onConfirm={() => handleRegenerate(confirmRegenerateDay)}
            onCancel={() => setConfirmRegenerateDay(null)}
          />
        )}

        {refineDay != null && devotionalsByDay.get(refineDay) && (
          <AdminDevotionalRefineModal
            devotional={devotionalsByDay.get(refineDay)!}
            onClose={() => setRefineDay(null)}
            onApplied={(d) => {
              mergeDevotional(d);
              selectDay(d.dayNumber);
              setToast(`${d.dayNumber}. nap finomítva és mentve (verziótörténet frissítve).`);
            }}
          />
        )}
      </AdminMain>
    </AdminShell>
  );
}
