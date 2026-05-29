"use client";

import { useState } from "react";
import {
  DEVOTIONAL_IMAGE_PLACEHOLDER_MESSAGE,
  resolveDevotionalDisplayImage,
} from "@/lib/image-assets";
import { SafeDevotionalImage } from "@/components/SafeDevotionalImage";

interface DevotionalIllustrationProps {
  imageUrl: string;
  alt: string;
  className?: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  placeholderClassName?: string;
  /** Ha nincs imageUrl: devotional fallback kép (nem hero!) */
  allowFallback?: boolean;
  placeholderMessage?: string;
}

export function DevotionalIllustration({
  imageUrl,
  alt,
  className = "",
  fill,
  priority,
  sizes,
  placeholderClassName = "",
  allowFallback = true,
  placeholderMessage = DEVOTIONAL_IMAGE_PLACEHOLDER_MESSAGE,
}: DevotionalIllustrationProps) {
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const resolved = resolveDevotionalDisplayImage(imageUrl, { allowFallback });

  const needsPlaceholder =
    resolved.kind === "placeholder" || (resolved.kind === "fallback" && fallbackFailed);

  if (needsPlaceholder) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-amber-50/90 via-ivory-100 to-ivory-200 text-center p-8 ${fill ? "absolute inset-0" : "min-h-[12rem] w-full rounded-2xl"} ${placeholderClassName}`}
        role="img"
        aria-label={placeholderMessage}
      >
        <p className="font-serif text-base md:text-lg text-ink-muted leading-relaxed max-w-md">
          {placeholderMessage}
        </p>
      </div>
    );
  }

  if (resolved.src) {
    return (
      <SafeDevotionalImage
        src={resolved.src}
        alt={alt}
        fill={fill}
        priority={priority}
        sizes={sizes}
        className={className}
        onError={resolved.kind === "fallback" ? () => setFallbackFailed(true) : undefined}
      />
    );
  }

  return null;
}
