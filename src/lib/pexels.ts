/** Szerveroldali Pexels API kliens — a kulcs soha ne kerüljön kliensre. */

import { loadEnvConfig } from "@next/env";
import { outboundFetch } from "./outbound-fetch";

export interface PexelsPhotoResult {
  id: number;
  width: number;
  height: number;
  pexelsUrl: string;
  photographer: string;
  photographerUrl: string;
  imageUrl: string;
  alt: string;
}

export interface PexelsImageAssignment {
  imageUrl: string;
  imageCredit: string;
  imagePhotographerUrl: string;
  pexelsPhotoId: number;
}

interface PexelsApiPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt?: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    landscape: string;
  };
}

interface PexelsSearchResponse {
  photos: PexelsApiPhoto[];
  total_results: number;
  page: number;
  per_page: number;
}

export const PEXELS_FALLBACK_SEARCH_QUERIES = [
  "peaceful landscape",
  "quiet forest",
  "sunrise path",
  "calm lake",
  "contemplative nature",
] as const;

const MIN_LANDSCAPE_WIDTH = 1024;
const MIN_LANDSCAPE_WIDTH_LOOSE = 640;

const REJECT_STOCK_PATTERN =
  /\b(portrait|selfie|headshot|closeup|close-up|business|corporate|office|meeting|handshake|boardroom|startup|skyscraper|cityscape|crowd|model|fashion|wedding|party|nightclub|gym|fitness|doctor|hospital|laptop|computer|smartphone|typing|desk|stock photo|artificial)\b/i;

const REJECT_PEOPLE_PATTERN =
  /\b(person|people|woman|women|girl|boy|human|face|couple|family|child|children|portrait|businessman|businesswoman|self portrait)\b/i;

const PREFER_ALT_PATTERN =
  /\b(nature|forest|path|trail|sunrise|sunset|lake|mountain|mist|fog|dawn|dusk|peaceful|calm|serene|meadow|river|trees|landscape|field|wood|light|horizon|valley|stream|countryside|cinematic|contemplative|quiet)\b/i;

let envLoaded = false;

function ensureEnvLoaded(): void {
  if (envLoaded) return;
  if (!process.env.PEXELS_API_KEY?.trim()) {
    loadEnvConfig(process.cwd());
  }
  envLoaded = true;
}

export function getPexelsApiKey(): string | undefined {
  ensureEnvLoaded();
  return process.env.PEXELS_API_KEY?.trim() || undefined;
}

export function isPexelsConfigured(): boolean {
  return Boolean(getPexelsApiKey());
}

/** Rövidített kulcsszó sor Pexels kereséshez (max 4 tag). */
export function normalizeKeywordsForPexelsSearch(raw: string): string {
  const tags = raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  return tags.join(" ").replace(/\s+/g, " ").trim();
}

/** Áhítatos keresés — kulcsszavak + finom kiegészítés. */
export function buildDevotionalPexelsQuery(keywords: string, category?: string): string {
  const normalized = normalizeKeywordsForPexelsSearch(keywords);
  const base =
    normalized ||
    (category?.trim()
      ? `${category.trim()} nature landscape`
      : "peaceful dawn nature landscape");

  const moodSuffix = "calm serene cinematic landscape";
  return `${base} ${moodSuffix}`.replace(/\s+/g, " ").trim().slice(0, 200);
}

function pickHighResUrl(photo: PexelsApiPhoto): string {
  return (
    photo.src.large2x ||
    photo.src.large ||
    photo.src.landscape ||
    photo.src.original ||
    photo.src.medium
  );
}

function mapPexelsPhoto(photo: PexelsApiPhoto): PexelsPhotoResult {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    pexelsUrl: photo.url,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    imageUrl: pickHighResUrl(photo),
    alt: photo.alt?.trim() || `Fotó: ${photo.photographer}`,
  };
}

export function photoToAssignment(photo: PexelsPhotoResult): PexelsImageAssignment {
  return {
    imageUrl: photo.imageUrl,
    imageCredit: photo.photographer,
    imagePhotographerUrl: photo.photographerUrl,
    pexelsPhotoId: photo.id,
  };
}

function photoMeta(photo: PexelsPhotoResult): string {
  return photo.alt.toLowerCase();
}

function isLandscapePhoto(photo: PexelsPhotoResult, minWidth: number): boolean {
  return photo.width > photo.height && photo.width >= minWidth;
}

function hasRejectedStockVibe(photo: PexelsPhotoResult): boolean {
  const meta = photoMeta(photo);
  return REJECT_STOCK_PATTERN.test(meta) || REJECT_PEOPLE_PATTERN.test(meta);
}

/** Landscape + áhítatos hangulat — nem portré / üzleti stock. */
export function isSuitableDevotionalPhoto(photo: PexelsPhotoResult): boolean {
  if (!isLandscapePhoto(photo, MIN_LANDSCAPE_WIDTH)) return false;
  if (hasRejectedStockVibe(photo)) return false;
  return true;
}

function preferScore(photo: PexelsPhotoResult): number {
  const meta = photoMeta(photo);
  let score = 0;
  if (PREFER_ALT_PATTERN.test(meta)) score += 3;
  if (photo.width >= MIN_LANDSCAPE_WIDTH) score += 1;
  return score;
}

function pickBestFromCandidates(
  photos: PexelsPhotoResult[],
  predicate: (photo: PexelsPhotoResult) => boolean
): PexelsPhotoResult | null {
  const candidates = photos.filter(predicate);
  if (!candidates.length) return null;

  return candidates.reduce((best, photo) =>
    preferScore(photo) > preferScore(best) ? photo : best
  );
}

/** Első megfelelő találat (preferált hangulat előnyben), majd enyhébb szűrés. */
export function pickFirstSuitablePhoto(photos: PexelsPhotoResult[]): PexelsPhotoResult | null {
  if (!photos.length) return null;

  const strict = pickBestFromCandidates(photos, isSuitableDevotionalPhoto);
  if (strict) return strict;

  const loose = pickBestFromCandidates(photos, (photo) => {
    if (!isLandscapePhoto(photo, MIN_LANDSCAPE_WIDTH_LOOSE)) return false;
    return !hasRejectedStockVibe(photo);
  });
  if (loose) return loose;

  return pickBestFromCandidates(photos, (photo) =>
    isLandscapePhoto(photo, MIN_LANDSCAPE_WIDTH_LOOSE)
  );
}

async function fetchPexelsSearch(
  searchQuery: string,
  perPage: number
): Promise<PexelsPhotoResult[]> {
  const apiKey = getPexelsApiKey();
  if (!apiKey) {
    throw new Error("A PEXELS_API_KEY nincs beállítva (.env.local).");
  }

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", searchQuery);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("size", "large");
  url.searchParams.set("per_page", String(Math.min(Math.max(perPage, 1), 30)));
  url.searchParams.set("locale", "en-US");

  const res = await outboundFetch(url.toString(), {
    headers: { Authorization: apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Pexels API hiba (${res.status})${body ? `: ${body.slice(0, 120)}` : ""}`
    );
  }

  const data = (await res.json()) as PexelsSearchResponse;
  return (data.photos ?? []).map(mapPexelsPhoto);
}

export async function searchPexelsPhotos(options: {
  query: string;
  category?: string;
  perPage?: number;
  enhanceQuery?: boolean;
}): Promise<{ photos: PexelsPhotoResult[]; searchQuery: string }> {
  const enhanceQuery = options.enhanceQuery !== false;
  const searchQuery = enhanceQuery
    ? buildDevotionalPexelsQuery(options.query, options.category)
    : options.query.trim();

  const photos = await fetchPexelsSearch(searchQuery, options.perPage ?? 6);

  return { photos, searchQuery };
}

/**
 * Automatikus Pexels kép — Gemini kulcsszavak, majd fallback keresések.
 * Null = nincs találat (publikus oldalon devotional fallback).
 */
export async function autoSelectPexelsImageForDevotional(options: {
  imageKeywords?: string;
  category?: string;
}): Promise<{ photo: PexelsPhotoResult; searchQuery: string } | null> {
  if (!isPexelsConfigured()) {
    console.warn("[autoSelectPexels] PEXELS_API_KEY nincs beállítva — kép kihagyva.");
    return null;
  }

  const queryPlan: { query: string; enhance: boolean }[] = [];

  if (options.imageKeywords?.trim()) {
    queryPlan.push({ query: options.imageKeywords.trim(), enhance: true });
    queryPlan.push({ query: normalizeKeywordsForPexelsSearch(options.imageKeywords), enhance: false });
  }

  if (options.category?.trim()) {
    queryPlan.push({
      query: `${options.category.trim()} peaceful nature landscape`,
      enhance: false,
    });
  }

  for (const fallback of PEXELS_FALLBACK_SEARCH_QUERIES) {
    queryPlan.push({ query: fallback, enhance: false });
  }

  const seen = new Set<string>();

  for (const { query, enhance } of queryPlan) {
    const normalized = query.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    try {
      const searchQuery = enhance
        ? buildDevotionalPexelsQuery(query, options.category)
        : query.trim();

      const photos = await fetchPexelsSearch(searchQuery, 15);
      const picked = pickFirstSuitablePhoto(photos);

      if (picked) {
        console.info(
          `[autoSelectPexels] Kiválasztva: photo ${picked.id} (${picked.width}x${picked.height}) — "${searchQuery}"`
        );
        return { photo: picked, searchQuery };
      }

      console.info(`[autoSelectPexels] Nincs megfelelő kép: "${searchQuery}" (${photos.length} találat)`);
    } catch (error) {
      console.warn(`[autoSelectPexels] Keresés hiba ("${query}"):`, error);
    }
  }

  console.warn("[autoSelectPexels] Összes keresés kimerült — devotional fallback marad.");
  return null;
}
