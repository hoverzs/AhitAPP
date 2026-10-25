"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDevotionalDate } from "@/lib/devotional-excerpt";
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
import {
  describeStorageReasonHu,
  type StorageErrorReason,
} from "@/lib/storage/errors";
import type { DevotionalMemory } from "@/lib/devotional-memory";
import { statusLabelHu } from "@/lib/devotional-status";
import { CopyButton } from "@/components/CopyButton";
import { formatDevotionalForFacebook, getPublicDevotionalUrl } from "@/lib/facebook";
import {
  getGeminiErrorTitle,
  type GeminiErrorDebugInfo,
} from "@/lib/gemini-error-labels";
import { formatGeminiDebugMeta } from "@/lib/gemini-debug-display";
import { useGeminiLoadingMessage } from "@/hooks/useGeminiLoadingMessage";
import {
  formatGenerationJobTimestamp,
  generationJobStatusLabel,
} from "@/lib/generation-job-labels";
import type { AdminDailyGenerationJobSummary } from "@/lib/types";

interface AdminDashboardProps {
  /** Mai nap (YYYY-MM-DD, Europe/Bucharest) — a szerver határozza meg. */
  todayIso: string;
  memory: DevotionalMemory;
  latestDevotional: Devotional | null;
  adminContext: AdminDevotionalContext;
  initialListItems: AdminDevotionalListItem[];
  initialDevotionals: Devotional[];
  storageError?: string | null;
  storageHint?: string | null;
  storageReason?: StorageErrorReason | null;
  storageDetail?: string | null;
}

interface ApiErrorPayload {
  error?: string;
  hint?: string;
  code?: string;
  tlsMode?: string;
  isDevelopment?: boolean;
  debug?: GeminiErrorDebugInfo;
  pending_retry?: boolean;
  generationJob?: AdminDailyGenerationJobSummary;
}

interface PingResult {
  ok: boolean;
  tlsMode?: string;
  keyConfigured?: boolean;
  sample?: string;
  error?: string;
  hint?: string;
  code?: string;
  debug?: GeminiErrorDebugInfo;
}

const DUPLICATE_VERSE_MESSAGE =
  "A rendszer több használt igehelyet is elutasított, de most nem talált elég gyorsan új alapigét.";

const DUPLICATE_VERSE_HINT =
  "Ez nem API-hiba. Indítsd újra a generálást, és a rendszer új igehelyet keres.";

export function AdminDashboard({
  todayIso,
  memory,
  latestDevotional: initialLatest,
  adminContext,
  initialListItems,
  initialDevotionals,
  storageError: initialStorageError,
  storageHint: initialStorageHint,
  storageReason: initialStorageReason,
  storageDetail: initialStorageDetail,
}: AdminDashboardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [todayCronLoading, setTodayCronLoading] = useState(false);
  const [todayCronNotice, setTodayCronNotice] = useState<string | null>(null);
  const [regenerateLoading, setRegenerateLoading] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [context, setContext] = useState(adminContext);
  const [listItems, setListItems] = useState(initialListItems);
  const [devotionalsByDay, setDevotionalsByDay] = useState(() => {
    const map = new Map<string, Devotional>();
    for (const d of initialDevotionals) map.set(d.date, d);
    return map;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(
    initialLatest?.date ?? initialListItems[0]?.date ?? null
  );
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<EditableDevotionalFields | null>(null);
  const [confirmRegenerateDay, setConfirmRegenerateDay] = useState<string | null>(null);
  const [refineDay, setRefineDay] = useState<string | null>(null);
  const [loadingDay, setLoadingDay] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // A betöltött napok és a kiválasztott nap aktuális értéke aszinkron callbackekhez.
  const devotionalsByDayRef = useRef(devotionalsByDay);
  const selectedDayRef = useRef(selectedDay);
  useEffect(() => {
    devotionalsByDayRef.current = devotionalsByDay;
  }, [devotionalsByDay]);
  useEffect(() => {
    selectedDayRef.current = selectedDay;
  }, [selectedDay]);

  const geminiLoadingActive =
    loading || todayCronLoading || regenerateLoading !== null;
  const geminiLoadingMessage = useGeminiLoadingMessage(geminiLoadingActive);

  const preview = selectedDay != null ? devotionalsByDay.get(selectedDay) ?? null : null;

  // Munkafolyamat szerinti csoportosítás: a mai áhítat az előnézetben van,
  // alatta az időzített + függőben lévő, majd az (összecsukott) elmúlt napok.
  const { upcomingItems, pastItems } = useMemo(() => {
    const upcoming = listItems
      .filter(
        (i) =>
          i.date > todayIso || (i.date < todayIso && i.status !== "published")
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const past = listItems
      .filter((i) => i.date < todayIso && i.status === "published")
      .sort((a, b) => b.date.localeCompare(a.date));
    return { upcomingItems: upcoming, pastItems: past };
  }, [listItems, todayIso]);

  const mergeDevotional = useCallback((d: Devotional) => {
    setDevotionalsByDay((prev) => new Map(prev).set(d.date, d));
    setListItems((prev) => {
      const item: AdminDevotionalListItem = {
        date: d.date,
        title: d.title,
        verse: d.verse,
        status: d.status ?? "published",
        generatedAt: d.generatedAt,
        updatedAt: d.updatedAt,
        editedByAdmin: d.editedByAdmin,
        category: d.category,
      };
      const idx = prev.findIndex((i) => i.date === d.date);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next.sort((a, b) => b.date.localeCompare(a.date));
      }
      return [item, ...prev].sort((a, b) => b.date.localeCompare(a.date));
    });
  }, []);

  /**
   * Egy nap teljes rekordja: a memóriából, vagy — „lusta" betöltéssel — a
   * szerverről. Csak a megnyitott napot kérjük le, nem a teljes készletet.
   */
  const loadDay = useCallback(
    async (date: string): Promise<Devotional | null> => {
      const cached = devotionalsByDayRef.current.get(date);
      if (cached) return cached;

      setLoadingDay(date);
      try {
        const res = await fetch(`/api/admin/devotional?date=${date}`);
        const data = (await res.json()) as ApiErrorPayload & { devotional?: Devotional };
        if (!res.ok || !data.devotional) {
          setError({
            error: data.error ?? "A nap betöltése sikertelen.",
            hint: data.hint,
            code: data.code,
          });
          return null;
        }
        const loaded = data.devotional;
        setDevotionalsByDay((prev) => new Map(prev).set(loaded.date, loaded));
        return loaded;
      } catch {
        setError({ error: "Hálózati hiba a nap betöltése közben.", code: "NETWORK" });
        return null;
      } finally {
        setLoadingDay((current) => (current === date ? null : current));
      }
    },
    []
  );

  const refreshFromServer = useCallback(async () => {
    const res = await fetch("/api/admin/devotionals");
    if (!res.ok) return;
    const data = (await res.json()) as {
      lazy?: boolean;
      items: AdminDevotionalListItem[];
      devotionals: Devotional[];
    };
    setListItems(data.items);

    if (data.lazy) {
      // Lusta tároló: a már betöltött napokból csak a változatlanokat tartjuk meg.
      const kept = new Map<string, Devotional>();
      for (const [day, d] of devotionalsByDayRef.current) {
        const item = data.items.find((i) => i.date === day);
        if (item && item.updatedAt === d.updatedAt) kept.set(day, d);
      }
      devotionalsByDayRef.current = kept;
      setDevotionalsByDay(kept);
      const selected = selectedDayRef.current;
      if (selected != null && !kept.has(selected)) void loadDay(selected);
      return;
    }

    const map = new Map<string, Devotional>();
    for (const d of data.devotionals) map.set(d.date, d);
    setDevotionalsByDay(map);
  }, [loadDay]);

  const scrollToPreview = useCallback(() => {
    requestAnimationFrame(() =>
      document
        .getElementById("admin-preview")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, []);

  const selectDay = useCallback(
    (date: string) => {
      setSelectedDay(date);
      setEditMode(false);
      setEditFields(null);
      setError(null);
      scrollToPreview();
      void loadDay(date);
    },
    [scrollToPreview, loadDay]
  );

  const enterEditMode = useCallback(
    async (date: string) => {
      setSelectedDay(date);
      const d = await loadDay(date);
      if (!d) return;
      setEditFields(initEditableFields(d));
      setEditMode(true);
      setError(null);
      scrollToPreview();
    },
    [loadDay, scrollToPreview]
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
          date: string;
          title: string;
          status?: string;
        };
      };

      if (data.generationJob) {
        setContext((prev) => ({
          ...prev,
          todayGenerationJob: data.generationJob,
        }));
      }

      if (res.status === 202 || data.pending_retry) {
        setTodayCronNotice(
          data.hint ??
            "Az első próba sikertelen — legfeljebb 3 óránkénti automatikus újrapróba ütemezve (+1h, +2h, +3h)."
        );
        return;
      }

      if (!res.ok || !data.success) {
        const isStorageCode =
          data.code === "STORAGE_ERROR" || data.code === "STORAGE_NOT_CONFIGURED";
        const friendlyError = isStorageCode
          ? (data.error ?? "Az áhítatok tárolója nem érhető el.")
          : data.code === "DUPLICATE_VERSE"
            ? DUPLICATE_VERSE_MESSAGE
            : data.code === "GEMINI_OVERLOAD"
            ? (data.hint ??
              "A Gemini szervere átmenetileg túlterhelt. Automatikus újrapróbák után sem sikerült — várj 1–2 percet.")
            : data.code
              ? `${getGeminiErrorTitle(data.code)}. Próbáld újra később, vagy ellenőrizd az API beállításokat.`
              : (data.error ?? "A mai áhítat generálása sikertelen.");
        setError({
          error: friendlyError,
          hint:
            data.code === "DUPLICATE_VERSE"
              ? (data.hint ?? DUPLICATE_VERSE_HINT)
              : data.hint ??
            (data.code === "GEMINI_OVERLOAD"
              ? "A szerver 3× automatikusan újrapróbálta (3 s, 8 s, 15 s várakozással)."
              : data.code === "NETWORK" || data.code === "TLS_CERTIFICATE"
                ? "Ellenőrizd a hálózati kapcsolatot, majd próbáld újra."
                : data.code === "API_KEY" || data.code === "AUTH"
                  ? "Ellenőrizd a GEMINI_API_KEY környezeti változót."
                  : data.code === "QUOTA"
                    ? "429 kvóta — várj, vagy növeld a limitet a Google AI Studio-ban."
                    : data.code
                      ? "Ha a hiba tartós, nézd meg a szerver naplókat ([gemini-api])."
                      : undefined),
          code: data.code,
          debug: data.debug,
        });
        return;
      }

      if (data.skipped) {
        setTodayCronNotice(
          data.message ??
            "A mai napra már van áhítat. Használd az újragenerálás gombot, ha módosítani szeretnéd."
        );
        if (data.devotional?.date) {
          await refreshFromServer();
          selectDay(data.devotional.date);
        }
        return;
      }

      await refreshFromServer();
      if (data.devotional?.date) {
        selectDay(data.devotional.date);
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
              ? (data.error ?? DUPLICATE_VERSE_MESSAGE)
              : data.code === "GEMINI_OVERLOAD"
              ? (data.hint ?? data.error ?? "A Gemini átmenetileg túlterhelt.")
              : (data.error ?? "Generálás sikertelen."),
          hint:
            data.code === "DUPLICATE_VERSE"
              ? (data.hint ?? DUPLICATE_VERSE_HINT)
              : data.hint,
          code: data.code,
          tlsMode: data.tlsMode,
          isDevelopment: data.isDevelopment,
          debug: data.debug,
        });
        return;
      }

      if (data.devotional) {
        mergeDevotional(data.devotional);
        selectDay(data.devotional.date);
        const d = data.devotional;
        const imageNote =
          d.imageUrl && (d.imageSource === "pexels_auto" || d.imageSource === "pexels")
            ? " · Pexels kép hozzárendelve"
            : d.imageUrl
              ? " · Kép mentve"
              : " · Alapértelmezett fallback kép";
        setToast(`Generálva: ${d.date}${imageNote}`);
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

  async function handleRegenerate(date: string) {
    setRegenerateLoading(date);
    setError(null);
    setConfirmRegenerateDay(null);

    try {
      const res = await fetch("/api/admin/devotional/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, backup: true }),
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
              ? (data.error ?? DUPLICATE_VERSE_MESSAGE)
              : data.code === "GEMINI_OVERLOAD"
              ? (data.hint ?? data.error ?? "A Gemini átmenetileg túlterhelt.")
              : (data.error ?? "Újragenerálás sikertelen."),
          hint:
            data.code === "DUPLICATE_VERSE"
              ? (data.hint ?? DUPLICATE_VERSE_HINT)
              : data.hint,
          code: data.code,
          debug: data.debug,
        });
        return;
      }

      if (data.devotional) {
        mergeDevotional(data.devotional);
        selectDay(data.devotional.date);
        if (editMode) {
          setEditFields(initEditableFields(data.devotional));
        }
        setToast(
          data.backedUp
            ? `${date}: újragenerálva (előző verzió mentve).`
            : `${date}: újragenerálva.`
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
    fields?: EditableDevotionalFields,
    date?: string
  ) {
    // A listából indított művelet (pl. Közzététel) a nap betöltése nélkül is megy.
    const targetDay = date ?? preview?.date;
    if (targetDay == null) return;

    setActionLoading(action);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        date: targetDay,
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
    ? formatDevotionalForFacebook(preview, getPublicDevotionalUrl(preview.date))
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
            title={describeStorageReasonHu(initialStorageReason ?? "unknown").title}
            message={initialStorageError}
            hint={initialStorageHint ?? undefined}
            meta={
              [initialStorageReason, initialStorageDetail].filter(Boolean).join(" · ") ||
              undefined
            }
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

        <AdminPanel
          title="Új áhítat készítése"
          description={
            context.devReviewMode
              ? "Aktuális generálási cél"
              : "Következő generálandó nap"
          }
        >
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-serif text-4xl font-semibold text-ink tracking-tight">
                {formatDevotionalDate(target.date)}
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
                Boolean(initialStorageError) ||
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

          {initialStorageError && (
            <p className="mt-4 text-sm text-amber-900 rounded-xl bg-amber-50 border border-amber-200/70 px-4 py-3">
              A generálás addig nem indítható, amíg az áhítatok tárolója nem érhető el
              (lásd a fenti hibaüzenetet). A megjelenített „{target.date}” cél
              ilyenkor nem megbízható.
            </p>
          )}

          {target.action === "update" && (
            <p className="mt-4 text-sm text-ink-muted rounded-xl bg-ivory-50 border border-ivory-200 px-4 py-3">
              Erre a napra már van áhítat. Az alábbi előnézetben szerkesztheted,
              vagy használhatod az „Újragenerálás” gombot.
            </p>
          )}

          {target.blockedReason && (
            <p className="mt-4 text-sm text-amber-900 rounded-xl bg-amber-50 border border-amber-200/70 px-4 py-3">
              {target.blockedReason}
            </p>
          )}

        </AdminPanel>

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
            variant={error.code === "DUPLICATE_VERSE" ? "warning" : "error"}
            meta={
              [error.code, error.tlsMode, formatGeminiDebugMeta(error.debug)]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
        )}

        {toast && <AdminToast message={toast} />}

        <span id="admin-preview" className="block scroll-mt-4" />
        {preview && (
          <AdminPanel noPadding className="overflow-hidden">
            <div className="admin-preview-hero">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="editorial-eyebrow">
                    {preview.date === todayIso ? "Mai áhítat · " : ""}{editMode ? "Szerkesztő" : "Előnézet"} · {preview.date}
                  </p>
                  <h2 className="font-serif text-2xl md:text-3xl font-semibold text-ink mt-2 tracking-tight leading-snug">
                    {preview.date} —{" "}
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
                  <AdminButton variant="edit" onClick={() => enterEditMode(preview.date)}>
                    Szerkesztés
                  </AdminButton>
                  <AdminButton
                    variant="regenerate"
                    onClick={() => setConfirmRegenerateDay(preview.date)}
                    disabled={regenerateLoading !== null}
                  >
                    Újragenerálás
                  </AdminButton>
                  <AdminButton
                    variant="default"
                    onClick={() => setRefineDay(preview.date)}
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

        {!preview && (
          <AdminPanel title="Mai áhítat" description={todayIso}>
            <p
              className="text-sm text-ink-muted font-serif italic py-4 text-center"
              role="status"
              aria-live="polite"
            >
              {loadingDay != null
                ? `A(z) ${loadingDay} betöltése…`
                : "A mai napra még nincs áhítat. Készíts egyet a fenti „Új áhítat készítése” panelen."}
            </p>
          </AdminPanel>
        )}

        <AdminPanel
          title="Időzített áhítatok és piszkozatok"
          description={`${upcomingItems.length} tétel`}
          action={
            <AdminButton variant="ghost" size="sm" onClick={() => refreshFromServer()}>
              Frissítés
            </AdminButton>
          }
          noPadding
        >
          <div className="px-2 pb-2">
            {upcomingItems.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-8 font-serif italic">
                Nincs időzített áhítat vagy piszkozat.
              </p>
            ) : (
              <AdminDevotionalList
                items={upcomingItems}
                selectedDate={selectedDay}
              onSelect={selectDay}
              onEdit={enterEditMode}
              onRegenerate={(day) => setConfirmRegenerateDay(day)}
              onRefine={(day) => {
                void loadDay(day).then((d) => {
                  if (d) setRefineDay(day);
                });
              }}
              onPublish={(day) => {
                selectDay(day);
                handleAdminAction("publish", undefined, day);
              }}
              loadingDay={regenerateLoading}
              />
            )}
          </div>
        </AdminPanel>

        <details className="admin-collapsible group">
          <summary className="cursor-pointer select-none rounded-2xl border border-ivory-200 bg-white/70 px-5 py-4 text-sm font-semibold text-ink hover:bg-ivory-50">
            Elmúlt 7 nap ({pastItems.length})
          </summary>
          <div className="mt-3">
            <AdminPanel noPadding>
              <div className="px-2 pb-2">
                <AdminDevotionalList
                  items={pastItems}
                  selectedDate={selectedDay}
              onSelect={selectDay}
              onEdit={enterEditMode}
              onRegenerate={(day) => setConfirmRegenerateDay(day)}
              onRefine={(day) => {
                void loadDay(day).then((d) => {
                  if (d) setRefineDay(day);
                });
              }}
              onPublish={(day) => {
                selectDay(day);
                handleAdminAction("publish", undefined, day);
              }}
              loadingDay={regenerateLoading}
                />
              </div>
            </AdminPanel>
          </div>
        </details>

        <details className="admin-collapsible group">
          <summary className="cursor-pointer select-none rounded-2xl border border-ivory-200 bg-white/70 px-5 py-4 text-sm font-semibold text-ink hover:bg-ivory-50">
            Diagnosztika és automatikus generálás
          </summary>
          <div className="mt-3 space-y-6">
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
                hint={preview ? preview.date : `${target.date} cél`}
              />
            </div>
    

            <AdminPanel title="Automatikus generálás és ütemezés">
                  <div>
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
    
                    {context.externalRetryCron && (
                      <div className="mt-6 rounded-xl border border-ivory-200 bg-ivory-50/80 px-4 py-4 text-sm text-ink-muted">
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink mb-2">
                          Külső retry ütemező (Vercel Hobby)
                        </p>
                        <p className="leading-relaxed">{context.externalRetryCron.helpText}</p>
                        <p className="mt-3 text-[13px]">
                          <span className="font-medium text-ink">Endpoint:</span>{" "}
                          <code className="text-xs break-all bg-white/80 px-1.5 py-0.5 rounded border border-ivory-200">
                            {context.externalRetryCron.endpointUrl}
                          </code>
                        </p>
                        <p className="mt-2 text-[13px]">
                          <span className="font-medium text-ink">Javasolt futtatás:</span>{" "}
                          {context.externalRetryCron.scheduleLabel}
                        </p>
                        <p className="mt-2 text-[12px] leading-relaxed">
                          Hitelesítés:{" "}
                          <code className="text-xs">Authorization: Bearer &lt;CRON_SECRET&gt;</code>
                          . A <code className="text-xs">CRON_SECRET</code> értékét a Vercel
                          Environment Variables között állítsd be — itt nem jelenik meg.
                        </p>
                      </div>
                    )}
    
                    {context.todayGenerationJob && (
                      <div
                        className={`mt-6 rounded-xl border px-4 py-4 text-sm ${
                          context.todayGenerationJob.status === "failed"
                            ? "bg-red-50/80 border-red-200/70 text-red-900"
                            : context.todayGenerationJob.status === "published"
                              ? "bg-emerald-50/80 border-emerald-200/70 text-emerald-900"
                              : "bg-amber-50/60 border-amber-200/60 text-amber-950"
                        }`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider mb-3">
                          Mai automatikus generálás
                        </p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                          <div>
                            <dt className="text-[11px] uppercase tracking-wide opacity-70">
                              Státusz
                            </dt>
                            <dd className="font-medium">
                              {generationJobStatusLabel(context.todayGenerationJob.status)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-wide opacity-70">
                              Próbálkozások
                            </dt>
                            <dd>
                              {context.todayGenerationJob.retry_count}
                              {context.todayGenerationJob.auto_retry_count > 0
                                ? ` (${context.todayGenerationJob.auto_retry_count}/3 óránkénti retry)`
                                : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-wide opacity-70">
                              Utolsó kísérlet
                            </dt>
                            <dd>
                              {formatGenerationJobTimestamp(
                                context.todayGenerationJob.last_attempt_at
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-wide opacity-70">
                              Következő retry
                            </dt>
                            <dd>
                              {formatGenerationJobTimestamp(
                                context.todayGenerationJob.next_retry_at
                              )}
                            </dd>
                          </div>
                          {context.todayGenerationJob.published_at && (
                            <div className="sm:col-span-2">
                              <dt className="text-[11px] uppercase tracking-wide opacity-70">
                                Sikeres generálás
                              </dt>
                              <dd>
                                {formatGenerationJobTimestamp(
                                  context.todayGenerationJob.published_at
                                )}
                              </dd>
                            </div>
                          )}
                          {context.todayGenerationJob.last_error && (
                            <div className="sm:col-span-2">
                              <dt className="text-[11px] uppercase tracking-wide opacity-70">
                                Utolsó hiba
                              </dt>
                              <dd className="text-[13px] leading-relaxed">
                                {context.todayGenerationJob.last_error}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                  </div>
    
            </AdminPanel>
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
                        meta={
                          [
                            pingResult.code,
                            pingResult.tlsMode,
                            formatGeminiDebugMeta(pingResult.debug),
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                      />
                    </div>
                  )}
                </AdminPanel>
    
          </div>
        </details>

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
              selectDay(d.date);
              setToast(`${d.date}: finomítva és mentve (verziótörténet frissítve).`);
            }}
          />
        )}
      </AdminMain>
    </AdminShell>
  );
}
