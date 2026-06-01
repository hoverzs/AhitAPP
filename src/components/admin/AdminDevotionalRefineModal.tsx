"use client";

import { useCallback, useState } from "react";
import { DevotionalContent } from "@/components/devotional/DevotionalContent";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminPanel } from "@/components/admin/ui/AdminPanel";
import { AdminErrorAlert } from "@/components/admin/ui/AdminAlerts";
import type { GeminiErrorDebugInfo } from "@/lib/gemini-error-labels";
import { formatGeminiDebugMeta } from "@/lib/gemini-debug-display";
import { IconSpinner } from "@/components/icons";
import { REFINE_INSTRUCTION_SUGGESTIONS } from "@/lib/prompts/devotional-refine-prompt";
import type {
  Devotional,
  DevotionalRefinementResult,
} from "@/lib/types";
import type { RefinementStatusAfter } from "@/lib/refine-devotional";

interface AdminDevotionalRefineModalProps {
  devotional: Devotional;
  onClose: () => void;
  onApplied: (devotional: Devotional) => void;
}

type Phase = "form" | "preview";

interface ApiErrorPayload {
  error?: string;
  hint?: string;
  code?: string;
  debug?: GeminiErrorDebugInfo;
}

export function AdminDevotionalRefineModal({
  devotional,
  onClose,
  onApplied,
}: AdminDevotionalRefineModalProps) {
  const [phase, setPhase] = useState<Phase>("form");
  const [instruction, setInstruction] = useState("");
  const [updateImageKeywords, setUpdateImageKeywords] = useState(false);
  const [statusAfter, setStatusAfter] = useState<RefinementStatusAfter>("needs_review");
  const [refined, setRefined] = useState<DevotionalRefinementResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [previewTab, setPreviewTab] = useState<"refined" | "original">("refined");

  const appendSuggestion = useCallback((text: string) => {
    setInstruction((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      if (trimmed.includes(text)) return prev;
      return `${trimmed}\n${text}`;
    });
  }, []);

  async function handleGeneratePreview() {
    if (!instruction.trim()) {
      setError({ error: "Írj be legalább egy finomítási instrukciót." });
      return;
    }

    setPreviewLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/devotional/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayNumber: devotional.dayNumber,
          instruction: instruction.trim(),
          updateImageKeywords,
        }),
      });

      const data = (await res.json()) as ApiErrorPayload & {
        refined?: DevotionalRefinementResult;
      };

      if (!res.ok || !data.refined) {
        setError({
          error: data.error ?? "Finomítás sikertelen.",
          hint: data.hint,
          code: data.code,
          debug: data.debug,
        });
        return;
      }

      setRefined(data.refined);
      setPhase("preview");
      setPreviewTab("refined");
    } catch {
      setError({ error: "Hálózati hiba a finomítás során.", code: "NETWORK" });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApply() {
    if (!refined) return;

    setApplyLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/devotional/refine/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayNumber: devotional.dayNumber,
          instruction: instruction.trim(),
          refined,
          statusAfter,
          updateImageKeywords,
        }),
      });

      const data = (await res.json()) as ApiErrorPayload & {
        devotional?: Devotional;
      };

      if (!res.ok || !data.devotional) {
        setError({ error: data.error ?? "Mentés sikertelen." });
        return;
      }

      onApplied(data.devotional);
      onClose();
    } catch {
      setError({ error: "Hálózati hiba a mentés során.", code: "NETWORK" });
    } finally {
      setApplyLoading(false);
    }
  }

  function handleDiscardPreview() {
    setRefined(null);
    setPhase("form");
    setError(null);
  }

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <AdminPanel
        title={`AI finomítás — ${devotional.dayNumber}. nap`}
        className="admin-modal admin-refine-modal w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <p className="text-sm text-ink-muted leading-relaxed -mt-2 mb-4">
          Célzott szövegfinomítás a meglévő áhítaton — nem teljes újragenerálás. A mentés előtt
          előnézetben ellenőrizheted a változtatásokat.
        </p>

        {error && (
          <div className="mb-4">
            <AdminErrorAlert
              title="Hiba"
              message={error.error ?? "Ismeretlen hiba."}
              hint={error.hint}
              meta={
                [error.code, formatGeminiDebugMeta(error.debug)]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pr-1">
          {phase === "form" && (
            <>
              <div className="admin-refine-current-preview">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-600/90 mb-2">
                  Jelenlegi áhítat
                </p>
                <div className="rounded-xl border border-ivory-200/90 bg-ivory-50/60 p-4 max-h-48 overflow-y-auto">
                  <p className="font-serif text-base font-semibold text-ink mb-1">
                    {devotional.title}
                  </p>
                  <p className="text-xs text-ink-muted mb-3">{devotional.verse}</p>
                  <div className="text-sm text-ink-muted line-clamp-6 whitespace-pre-wrap">
                    {devotional.content.slice(0, 600)}
                    {devotional.content.length > 600 ? "…" : ""}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="refine-instruction"
                  className="block text-sm font-medium text-ink mb-2"
                >
                  Finomítási instrukció
                </label>
                <textarea
                  id="refine-instruction"
                  rows={5}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Pl.: legyen rövidebb és személyesebb; erősítsd a zárógondolatot…"
                  className="admin-refine-textarea w-full rounded-xl border border-ivory-200 bg-white px-4 py-3 text-sm text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-gold-500/30 focus:border-gold-400/60 resize-y min-h-[120px]"
                  disabled={previewLoading}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {REFINE_INSTRUCTION_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="admin-refine-chip"
                      onClick={() => appendSuggestion(suggestion)}
                      disabled={previewLoading}
                    >
                      {suggestion.replace(/\*\*/g, "")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateImageKeywords}
                    onChange={(e) => setUpdateImageKeywords(e.target.checked)}
                    disabled={previewLoading}
                    className="rounded border-ivory-300 text-gold-600 focus:ring-gold-500/30"
                  />
                  Frissítsd a kép kulcsszavait is
                </label>
              </div>
            </>
          )}

          {phase === "preview" && refined && (
            <>
              <div className="flex gap-2 border-b border-ivory-200 pb-2">
                <button
                  type="button"
                  className={`admin-refine-tab ${previewTab === "refined" ? "admin-refine-tab-active" : ""}`}
                  onClick={() => setPreviewTab("refined")}
                >
                  Finomított változat
                </button>
                <button
                  type="button"
                  className={`admin-refine-tab ${previewTab === "original" ? "admin-refine-tab-active" : ""}`}
                  onClick={() => setPreviewTab("original")}
                >
                  Eredeti
                </button>
              </div>

              <div className="rounded-xl border border-ivory-200/90 bg-white p-5 md:p-6 max-h-[50vh] overflow-y-auto">
                {previewTab === "refined" ? (
                  <>
                    <p className="font-serif text-xl font-semibold text-ink mb-1">
                      {refined.title}
                    </p>
                    <p className="text-sm text-gold-600/90 mb-1">{refined.category}</p>
                    <p className="text-xs text-ink-muted mb-4">{refined.verse}</p>
                    <DevotionalContent content={refined.content} verse={refined.verse} title={refined.title} />
                    {updateImageKeywords && refined.imageKeywords && (
                      <p className="mt-4 text-xs text-ink-muted border-t border-ivory-100 pt-3">
                        Új kép kulcsszavak:{" "}
                        <span className="font-mono">{refined.imageKeywords}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-serif text-xl font-semibold text-ink mb-1">
                      {devotional.title}
                    </p>
                    <p className="text-sm text-gold-600/90 mb-1">{devotional.category}</p>
                    <p className="text-xs text-ink-muted mb-4">{devotional.verse}</p>
                    <DevotionalContent content={devotional.content} verse={devotional.verse} title={devotional.title} />
                  </>
                )}
              </div>

              <div className="rounded-xl border border-ivory-200/80 bg-ivory-50/50 p-4">
                <p className="text-sm font-medium text-ink mb-3">Mentés utáni státusz</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="statusAfter"
                      checked={statusAfter === "needs_review"}
                      onChange={() => setStatusAfter("needs_review")}
                      disabled={applyLoading}
                    />
                    Ellenőrzésre vár (needs_review)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="statusAfter"
                      checked={statusAfter === "published"}
                      onChange={() => setStatusAfter("published")}
                      disabled={applyLoading}
                    />
                    Maradjon közzétéve
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="statusAfter"
                      checked={statusAfter === "keep"}
                      onChange={() => setStatusAfter("keep")}
                      disabled={applyLoading}
                    />
                    Státusz ne változzon
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-ivory-200 flex flex-wrap gap-3 justify-end shrink-0">
          <AdminButton variant="ghost" onClick={onClose} disabled={previewLoading || applyLoading}>
            Bezárás
          </AdminButton>

          {phase === "form" && (
            <AdminButton
              variant="primary"
              onClick={handleGeneratePreview}
              disabled={previewLoading || !instruction.trim()}
            >
              {previewLoading ? (
                <>
                  <IconSpinner className="w-4 h-4 mr-2 inline" />
                  Finomítás…
                </>
              ) : (
                "Finomított változat készítése"
              )}
            </AdminButton>
          )}

          {phase === "preview" && (
            <>
              <AdminButton
                variant="ghost"
                onClick={handleDiscardPreview}
                disabled={applyLoading}
              >
                Elvetés
              </AdminButton>
              <AdminButton
                variant="primary"
                onClick={handleApply}
                disabled={applyLoading}
              >
                {applyLoading ? "Mentés…" : "Elfogadás és mentés"}
              </AdminButton>
            </>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}
