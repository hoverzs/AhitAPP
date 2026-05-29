/**
 * Képútvonalak — a hero és az áhítat képei teljesen külön kezelve.
 * A header kép SOHA nem használható napi áhítat illusztrációként.
 */

/** Fejléc / hero háttér — csak SiteHeader */
export const HERO_IMAGE = "/images/header-hero.png";

/** Napi áhítat alapértelmezett illusztrációja, ha nincs imageUrl */
export const DEVOTIONAL_FALLBACK_IMAGE = "/images/devotional-fallback.jpg";

export const DEVOTIONAL_IMAGE_PLACEHOLDER_MESSAGE =
  "Egy csendes pillanat — hamarosan illusztráció is kíséri ezt az áhítatot.";

export const DEVOTIONAL_IMAGE_ADMIN_EMPTY_MESSAGE =
  "Még nincs kép hozzárendelve. A publikus oldalon a devotional fallback jelenik meg, amíg nem választasz Pexels fotót.";

export type DevotionalImageSource = "pexels_auto" | "pexels" | "manual" | "imagen";

export type DevotionalDisplayImageKind = "assigned" | "fallback" | "placeholder";

export function isHeroImageUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === HERO_IMAGE.toLowerCase() ||
    normalized.endsWith("/header-hero.png") ||
    normalized.includes("header-hero")
  );
}

export function isDevotionalImageUrl(url: string | undefined): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  if (isHeroImageUrl(trimmed)) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return true;
  return false;
}

/** Van-e admin által hozzárendelt napi kép (Pexels / feltöltött / Imagen). */
export function hasAssignedDevotionalImage(imageUrl: string | undefined): boolean {
  return isDevotionalImageUrl(imageUrl);
}

export function isPexelsImageUrl(url: string): boolean {
  return url.includes("images.pexels.com");
}

export function devotionalImageSourceLabel(
  imageUrl: string | undefined,
  imageSource?: DevotionalImageSource
): string {
  if (hasAssignedDevotionalImage(imageUrl)) {
    switch (imageSource) {
      case "pexels_auto":
        return "Pexels (automatikus)";
      case "pexels":
        return "Pexels (kézi)";
      case "manual":
        return "Feltöltött / kézi";
      case "imagen":
        return "AI generált";
      default:
        return "Hozzárendelt kép";
    }
  }
  return "Alapértelmezett fallback";
}

export type ImageSourceBadgeVariant = "pexels" | "upload" | "fallback" | "imagen";

export function getImageSourceBadge(
  imageUrl: string | undefined,
  imageSource?: DevotionalImageSource
): { label: string; variant: ImageSourceBadgeVariant } {
  if (!hasAssignedDevotionalImage(imageUrl)) {
    return { label: "Fallback", variant: "fallback" };
  }
  switch (imageSource) {
    case "pexels_auto":
      return { label: "Pexels auto", variant: "pexels" };
    case "pexels":
      return { label: "Pexels", variant: "pexels" };
    case "manual":
      return { label: "Feltöltés", variant: "upload" };
    case "imagen":
      return { label: "AI kép", variant: "imagen" };
    default:
      return { label: "Egyedi", variant: "upload" };
  }
}

export interface ResolvedDevotionalDisplay {
  kind: DevotionalDisplayImageKind;
  src: string | null;
}

/**
 * Publikus megjelenítés:
 * 1. imageUrl (ha érvényes és nem hero)
 * 2. DEVOTIONAL_FALLBACK_IMAGE
 * 3. placeholder (csak allowFallback=false esetén)
 */
export function resolveDevotionalDisplayImage(
  imageUrl: string | undefined,
  options?: { allowFallback?: boolean }
): ResolvedDevotionalDisplay {
  if (hasAssignedDevotionalImage(imageUrl)) {
    return { kind: "assigned", src: imageUrl!.trim() };
  }

  if (options?.allowFallback !== false) {
    return { kind: "fallback", src: DEVOTIONAL_FALLBACK_IMAGE };
  }

  return { kind: "placeholder", src: null };
}

/** @deprecated hasAssignedDevotionalImage */
export function hasCustomDevotionalImage(imageUrl: string | undefined): boolean {
  return hasAssignedDevotionalImage(imageUrl);
}

/** @deprecated isDevotionalImageUrl */
export function isDevotionalImageAvailable(imageUrl: string | undefined): boolean {
  return isDevotionalImageUrl(imageUrl);
}
