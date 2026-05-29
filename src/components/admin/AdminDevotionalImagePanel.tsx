"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Devotional } from "@/lib/types";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { SafeDevotionalImage } from "@/components/SafeDevotionalImage";
import { IconImageLandscape, IconSearch, IconSpinner } from "@/components/icons";
import {
  getImageSourceBadge,
  hasAssignedDevotionalImage,
  type ImageSourceBadgeVariant,
} from "@/lib/image-assets";
import {
  appendKeywordToQuery,
  parseImageKeywordTags,
  suggestedKeywordTags,
} from "@/lib/image-keywords";

export interface PexelsPhotoOption {
  id: number;
  width: number;
  height: number;
  pexelsUrl: string;
  photographer: string;
  photographerUrl: string;
  imageUrl: string;
  alt: string;
}

interface AdminDevotionalImagePanelProps {
  devotional: Devotional;
  onImageSelected: (devotional: Devotional) => void;
  onToast?: (message: string) => void;
}

const BADGE_CLASS: Record<ImageSourceBadgeVariant, string> = {
  fallback: "admin-image-source-badge-fallback",
  pexels: "admin-image-source-badge-pexels",
  upload: "admin-image-source-badge-upload",
  imagen: "admin-image-source-badge-imagen",
};

function SourceBadge({
  imageUrl,
  imageSource,
}: {
  imageUrl: string;
  imageSource?: Devotional["imageSource"];
}) {
  const badge = getImageSourceBadge(imageUrl, imageSource);
  return (
    <span className={`admin-image-source-badge ${BADGE_CLASS[badge.variant]}`}>
      {badge.label}
    </span>
  );
}

function ImagePreviewHero({
  devotional,
  onRemove,
  removeLoading,
  onAutoSelect,
  autoLoading,
}: {
  devotional: Devotional;
  onRemove: () => void;
  removeLoading: boolean;
  onAutoSelect: () => void;
  autoLoading: boolean;
}) {
  const hasAssigned = hasAssignedDevotionalImage(devotional.imageUrl);

  if (!hasAssigned) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="admin-image-preview-frame admin-image-preview-frame-lg">
        <SafeDevotionalImage
          src={devotional.imageUrl}
          alt={devotional.title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 720px"
          priority
        />
      </div>
      <div className="admin-image-preview-credit">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge imageUrl={devotional.imageUrl} imageSource={devotional.imageSource} />
          {devotional.imageSource === "pexels_auto" && (
            <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              Automatikus
            </span>
          )}
          {(devotional.imageSource === "pexels" || devotional.imageSource === "pexels_auto") &&
            devotional.imageCredit && (
            <span>
              Fotó:{" "}
              <a
                href={devotional.imagePhotographerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-gold-700 transition-colors"
              >
                {devotional.imageCredit}
              </a>
            </span>
          )}
        </div>
        <button
          type="button"
          className="admin-image-remove-link"
          onClick={onRemove}
          disabled={removeLoading}
        >
          {removeLoading ? "Eltávolítás…" : "Kép eltávolítása"}
        </button>
        {devotional.imageSource !== "manual" && (
          <button
            type="button"
            className="admin-image-remove-link ml-3"
            onClick={onAutoSelect}
            disabled={autoLoading}
          >
            {autoLoading ? "Keresés…" : "Automatikus újrakeresés"}
          </button>
        )}
      </div>
    </div>
  );
}

function ImageEmptyState({
  onSearchClick,
  onAutoSelect,
  autoLoading,
}: {
  onSearchClick: () => void;
  onAutoSelect: () => void;
  autoLoading: boolean;
}) {
  return (
    <div className="admin-image-empty-state mb-8">
      <div className="admin-image-empty-icon">
        <IconImageLandscape className="w-8 h-8" />
      </div>
      <h4 className="admin-image-empty-title">Nincs egyedi illusztráció</h4>
      <p className="admin-image-empty-text">
        Generáláskor az app automatikusan keres Pexels képet a Gemini kulcsszavak alapján. Ha nem
        sikerült, itt indíthatod újra, kereshetsz manuálisan, vagy feltölthetsz saját képet.
      </p>
      <p className="admin-image-empty-note">
        A publikus oldalon addig egy semleges alapértelmezett kép látszik — ez normális állapot.
      </p>
      <div className="mt-7 flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <AdminButton
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={onAutoSelect}
          disabled={autoLoading}
        >
          {autoLoading ? (
            <>
              <IconSpinner className="w-4 h-4 mr-2" />
              Automatikus keresés…
            </>
          ) : (
            "Automatikus Pexels kiválasztás"
          )}
        </AdminButton>
        <AdminButton variant="default" size="lg" className="flex-1" onClick={onSearchClick}>
          <IconSearch className="w-4 h-4 mr-2" />
          Keress képet
        </AdminButton>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  const heights = ["aspect-[4/3]", "aspect-[3/4]", "aspect-[16/10]", "aspect-[5/4]", "aspect-[4/5]", "aspect-[16/9]"];

  return (
    <div className="admin-image-skeleton-grid" aria-hidden>
      {heights.map((aspect, i) => (
        <div
          key={i}
          className={`admin-image-skeleton ${aspect} rounded-xl`}
          style={{ animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}

function PexelsResultCard({
  photo,
  isCurrent,
  isSelecting,
  onSelect,
}: {
  photo: PexelsPhotoOption;
  isCurrent: boolean;
  isSelecting: boolean;
  onSelect: () => void;
}) {
  const aspectRatio =
    photo.width > 0 && photo.height > 0 ? `${photo.width}/${photo.height}` : "16/10";

  return (
    <li
      className={`admin-image-result-card group ${isCurrent ? "admin-image-result-card-selected" : ""}`}
    >
      <div className="relative w-full overflow-hidden bg-ivory-100" style={{ aspectRatio }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.imageUrl}
          alt={photo.alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="admin-image-result-overlay">
          <button
            type="button"
            className="admin-image-result-select-btn"
            disabled={isSelecting || isCurrent}
            onClick={onSelect}
          >
            {isCurrent ? "Kiválasztva" : isSelecting ? "Mentés…" : "Kiválasztom"}
          </button>
          <p className="mt-2 text-xs text-white/90 text-center truncate w-full">
            {photo.photographer}
          </p>
        </div>
        {isCurrent && (
          <span className="absolute top-2 left-2 rounded-full bg-gold-500/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
            Aktuális
          </span>
        )}
      </div>
      <div className="px-3 py-2.5 border-t border-ivory-100">
        <p className="text-xs text-ink-muted truncate">
          <a
            href={photo.photographerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gold-700 underline underline-offset-2 transition-colors"
          >
            {photo.photographer}
          </a>
          <span className="mx-1.5 text-ivory-300">·</span>
          <a
            href={photo.pexelsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gold-700 transition-colors"
          >
            Pexels
          </a>
        </p>
      </div>
    </li>
  );
}

export function AdminDevotionalImagePanel({
  devotional,
  onImageSelected,
  onToast,
}: AdminDevotionalImagePanelProps) {
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [keywords, setKeywords] = useState(devotional.imageKeywords ?? "");
  const [searchLoading, setSearchLoading] = useState(false);
  const [autoSelectLoading, setAutoSelectLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [selectLoadingId, setSelectLoadingId] = useState<number | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PexelsPhotoOption[]>([]);
  const [resultsVisible, setResultsVisible] = useState(false);

  const hasAssigned = hasAssignedDevotionalImage(devotional.imageUrl);
  const geminiTags = useMemo(
    () => parseImageKeywordTags(devotional.imageKeywords),
    [devotional.imageKeywords]
  );
  const chipTags = useMemo(
    () => suggestedKeywordTags(devotional.imageKeywords, devotional.category),
    [devotional.imageKeywords, devotional.category]
  );

  useEffect(() => {
    setKeywords(devotional.imageKeywords ?? "");
    setPhotos([]);
    setSearchError(null);
    setSearchQuery(null);
    setResultsVisible(false);
  }, [devotional.dayNumber, devotional.imageKeywords]);

  const scrollToSearch = useCallback(() => {
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => inputRef.current?.focus(), 350);
  }, []);

  const runSearch = useCallback(
    async (queryOverride?: string) => {
      const trimmed = (queryOverride ?? keywords).trim();
      if (!trimmed) return;

      setSearchLoading(true);
      setSearchError(null);
      setPhotos([]);
      setSearchQuery(null);
      setResultsVisible(false);

      try {
        if (trimmed !== (devotional.imageKeywords ?? "").trim()) {
          await fetch("/api/admin/devotional", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dayNumber: devotional.dayNumber,
              action: "save_image_keywords",
              imageKeywords: trimmed,
            }),
          });
        }

        const res = await fetch("/api/admin/pexels/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dayNumber: devotional.dayNumber,
            query: trimmed,
            category: devotional.category,
          }),
        });

        const data = (await res.json()) as {
          error?: string;
          photos?: PexelsPhotoOption[];
          searchQuery?: string;
        };

        if (!res.ok) {
          setSearchError(data.error ?? "Keresés sikertelen.");
          return;
        }

        setPhotos(data.photos ?? []);
        setSearchQuery(data.searchQuery ?? null);
        setResultsVisible(true);

        if (!data.photos?.length) {
          setSearchError("Nincs találat ehhez a kereséshez — próbálj más kulcsszót.");
        }
      } catch {
        setSearchError("Hálózati hiba a Pexels keresés során.");
      } finally {
        setSearchLoading(false);
      }
    },
    [devotional.category, devotional.dayNumber, devotional.imageKeywords, keywords]
  );

  const handleChipClick = useCallback(
    (tag: string) => {
      const next = appendKeywordToQuery(keywords, tag);
      setKeywords(next);
      void runSearch(tag);
    },
    [keywords, runSearch]
  );

  const handleEmptyCta = useCallback(() => {
    scrollToSearch();
    if (keywords.trim()) {
      void runSearch();
    }
  }, [keywords, runSearch, scrollToSearch]);

  async function handleSelect(photo: PexelsPhotoOption) {
    setSelectLoadingId(photo.id);
    setSearchError(null);

    try {
      const res = await fetch("/api/admin/devotional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayNumber: devotional.dayNumber,
          action: "select_pexels_image",
          image: {
            imageUrl: photo.imageUrl,
            imageCredit: photo.photographer,
            imagePhotographerUrl: photo.photographerUrl,
            pexelsPhotoId: photo.id,
          },
        }),
      });

      const data = (await res.json()) as { error?: string; devotional?: Devotional };

      if (!res.ok || !data.devotional) {
        setSearchError(data.error ?? "Kép mentése sikertelen.");
        return;
      }

      onImageSelected(data.devotional);
      onToast?.(`Illusztráció kiválasztva — ${photo.photographer}`);
    } catch {
      setSearchError("Hálózati hiba a kép mentése során.");
    } finally {
      setSelectLoadingId(null);
    }
  }

  async function handleAutoSelect() {
    setAutoSelectLoading(true);
    setSearchError(null);

    try {
      const res = await fetch("/api/admin/devotional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayNumber: devotional.dayNumber,
          action: "auto_select_pexels",
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        devotional?: Devotional;
      };

      if (!res.ok || !data.devotional) {
        setSearchError(data.error ?? data.hint ?? "Automatikus kiválasztás sikertelen.");
        return;
      }

      onImageSelected(data.devotional);
      onToast?.("Automatikus Pexels kép hozzárendelve.");
    } catch {
      setSearchError("Hálózati hiba az automatikus kiválasztás során.");
    } finally {
      setAutoSelectLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadLoading(true);
    setSearchError(null);

    try {
      const formData = new FormData();
      formData.append("dayNumber", String(devotional.dayNumber));
      formData.append("file", file);

      const res = await fetch("/api/admin/devotional/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { error?: string; devotional?: Devotional };

      if (!res.ok || !data.devotional) {
        setSearchError(data.error ?? "Feltöltés sikertelen.");
        return;
      }

      onImageSelected(data.devotional);
      onToast?.("Saját kép feltöltve és hozzárendelve.");
    } catch {
      setSearchError("Hálózati hiba a feltöltés során.");
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveImage() {
    if (!hasAssigned) return;

    setRemoveLoading(true);
    setSearchError(null);

    try {
      const res = await fetch("/api/admin/devotional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayNumber: devotional.dayNumber,
          action: "remove_image",
        }),
      });

      const data = (await res.json()) as { error?: string; devotional?: Devotional };

      if (!res.ok || !data.devotional) {
        setSearchError(data.error ?? "Kép eltávolítása sikertelen.");
        return;
      }

      onImageSelected(data.devotional);
      onToast?.("Illusztráció eltávolítva — alapértelmezett fallback marad.");
    } catch {
      setSearchError("Hálózati hiba a kép eltávolítása során.");
    } finally {
      setRemoveLoading(false);
    }
  }

  const isChipActive = (tag: string) =>
    keywords.toLowerCase().includes(tag.toLowerCase());

  return (
    <section className="admin-image-panel">
      <header className="admin-image-panel-header">
        <div>
          <p className="admin-image-panel-eyebrow">Vizuális tartalom</p>
          <h3 className="admin-image-panel-title">Napi illusztráció</h3>
          <p className="admin-image-panel-desc">
            Generáláskor automatikus Pexels kiválasztás. Itt cserélheted, kereshetsz újat, vagy
            tölthetsz fel saját képet.
          </p>
        </div>
        <SourceBadge imageUrl={devotional.imageUrl} imageSource={devotional.imageSource} />
      </header>

      {hasAssigned ? (
        <ImagePreviewHero
          devotional={devotional}
          onRemove={handleRemoveImage}
          removeLoading={removeLoading}
          onAutoSelect={handleAutoSelect}
          autoLoading={autoSelectLoading}
        />
      ) : (
        <ImageEmptyState
          onSearchClick={handleEmptyCta}
          onAutoSelect={handleAutoSelect}
          autoLoading={autoSelectLoading}
        />
      )}

      <div ref={searchRef} className="admin-image-search-card">
        <div className="admin-image-search-card-title">
          <span className="admin-image-search-icon-wrap">
            <IconSearch className="w-4 h-4" />
          </span>
          Stock képek keresése
        </div>
        <p className="admin-image-search-helper">
          Angol kulcsszavakkal kereshetsz tájképeket. A Gemini javaslatai alapján indulhatsz,
          vagy válassz egy címkét lent.
        </p>

        <div className="admin-image-search-row">
          <div className="admin-image-search-input-wrap">
            <IconSearch className="admin-image-search-input-icon w-4 h-4" />
            <input
              ref={inputRef}
              id="pexels-keywords"
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && keywords.trim() && !searchLoading) {
                  void runSearch();
                }
              }}
              placeholder="pl. quiet path, golden hour, misty forest"
              className="admin-image-search-input"
            />
          </div>
          <AdminButton
            variant="primary"
            onClick={() => runSearch()}
            disabled={searchLoading || !keywords.trim()}
            className="shrink-0 min-w-[140px]"
          >
            {searchLoading ? (
              <>
                <IconSpinner className="w-4 h-4 mr-2" />
                Keresés…
              </>
            ) : (
              "Keresés"
            )}
          </AdminButton>
        </div>

        <p className="admin-image-chips-label">
          {geminiTags.length > 0 ? "Gemini javaslatok" : "Ajánlott kulcsszavak"}
        </p>
        <div className="admin-image-keyword-chips">
          {chipTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`admin-image-keyword-chip ${isChipActive(tag) ? "admin-image-keyword-chip-active" : ""}`}
              onClick={() => handleChipClick(tag)}
              disabled={searchLoading}
            >
              {tag}
            </button>
          ))}
        </div>

        {searchQuery && !searchLoading && (
          <p className="mt-4 text-xs text-ink-muted/80">
            Lekérdezés: <span className="font-mono text-ink-muted">{searchQuery}</span>
          </p>
        )}
      </div>

      <div className="admin-image-search-card mt-5">
        <h4 className="admin-image-search-card-title">
          <span className="admin-image-search-icon-wrap">
            <IconImageLandscape className="w-4 h-4" />
          </span>
          Saját kép feltöltése
        </h4>
        <p className="admin-image-search-helper">
          JPG, PNG vagy WebP, max. 5 MB. A feltöltött kép felülírja a Pexels illusztrációt, és
          újrageneráláskor is megmarad.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm text-ink-muted file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-ivory-100 file:text-ink hover:file:bg-ivory-200/80"
            disabled={uploadLoading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          {uploadLoading && (
            <span className="inline-flex items-center text-sm text-ink-muted shrink-0">
              <IconSpinner className="w-4 h-4 mr-2" />
              Feltöltés…
            </span>
          )}
        </div>
      </div>

      {searchLoading && <ResultsSkeleton />}

      {searchError && !searchLoading && (
        <div
          className={`admin-image-info-banner mt-5 ${searchError.includes("Hálózati") || searchError.includes("sikertelen") ? "admin-image-info-banner-error" : ""}`}
          role="status"
        >
          {searchError}
        </div>
      )}

      {!searchLoading && photos.length > 0 && resultsVisible && (
        <ul className="admin-image-results-grid admin-image-results-enter">
          {photos.map((photo) => (
            <PexelsResultCard
              key={photo.id}
              photo={photo}
              isCurrent={devotional.pexelsPhotoId === photo.id}
              isSelecting={selectLoadingId === photo.id}
              onSelect={() => handleSelect(photo)}
            />
          ))}
        </ul>
      )}

      <p className="mt-8 text-[11px] text-ink-muted/60 text-center">
        Képek forrása:{" "}
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-gold-600 transition-colors"
        >
          Pexels
        </a>
        {" "}· A fotós neve kötelező a publikus oldalon
      </p>
    </section>
  );
}

/** @deprecated */
export const AdminPexelsPicker = AdminDevotionalImagePanel;
