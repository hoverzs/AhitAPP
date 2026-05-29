/** Képgenerálás (Imagen) — jelenleg kikapcsolva; stock fotó: Pexels. */
export const ENABLE_IMAGE_GENERATION = false;

export {
  HERO_IMAGE,
  DEVOTIONAL_FALLBACK_IMAGE,
  DEVOTIONAL_IMAGE_PLACEHOLDER_MESSAGE,
  DEVOTIONAL_IMAGE_ADMIN_EMPTY_MESSAGE,
  devotionalImageSourceLabel,
  hasAssignedDevotionalImage,
  hasCustomDevotionalImage,
  isDevotionalImageAvailable,
  isDevotionalImageUrl,
  isHeroImageUrl,
  isPexelsImageUrl,
  resolveDevotionalDisplayImage,
  type DevotionalDisplayImageKind,
  type DevotionalImageSource,
  type ResolvedDevotionalDisplay,
} from "./image-assets";
