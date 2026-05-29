"use client";

import Image from "next/image";
import { APP_BRAND_PREFIX, APP_BRAND_SUFFIX, LOGO_IMAGE } from "@/lib/brand";

interface LogoMarkProps {
  className?: string;
}

/** Embléma — arany kereszt, lombok, sugárzó fény. */
export function LogoMark({ className = "w-11 h-11" }: LogoMarkProps) {
  return (
    <span
      className={`logo-mark relative inline-block shrink-0 overflow-hidden rounded-xl shadow-[0_4px_18px_-6px_rgba(0,0,0,0.35)] ring-1 ring-black/20 transition-transform duration-200 group-hover:scale-[1.03] ${className}`}
    >
      <Image
        src={LOGO_IMAGE}
        alt={`${APP_BRAND_PREFIX}${APP_BRAND_SUFFIX} embléma`}
        fill
        className="object-cover"
        sizes="(max-width: 640px) 44px, 48px"
        priority
      />
    </span>
  );
}

interface LogoBrandTitleProps {
  variant?: "light" | "dark";
  size?: "default" | "sm";
  className?: string;
}

/** „Napi Áhit” + kiemelt „APP” — közös márka felirat. */
export function LogoBrandTitle({
  variant = "light",
  size = "default",
  className = "",
}: LogoBrandTitleProps) {
  const prefixSize = size === "sm" ? "logo-brand-prefix-sm" : "logo-brand-prefix-default";
  const suffixSize = size === "sm" ? "logo-brand-suffix-sm" : "logo-brand-suffix-default";
  const tone = variant === "dark" ? "dark" : "light";

  return (
    <span className={`logo-brand-title ${className}`}>
      <span className={`logo-brand-prefix ${prefixSize} logo-brand-prefix-${tone}`}>
        {APP_BRAND_PREFIX}
      </span>
      <span className={`logo-brand-suffix ${suffixSize} logo-brand-suffix-${tone}`}>
        {APP_BRAND_SUFFIX}
      </span>
    </span>
  );
}

interface LogoBrandProps {
  className?: string;
  markClassName?: string;
  showSubtitle?: boolean;
  /** Világos háttérön (alap) vagy sötét/hero fölött. */
  variant?: "light" | "dark";
}

/** Embléma + „Napi ÁhitAPP” tipográfia. */
export function LogoBrand({
  className = "",
  markClassName = "w-11 h-11 sm:w-12 sm:h-12",
  showSubtitle = true,
  variant = "light",
}: LogoBrandProps) {
  const subtitleClass =
    variant === "dark"
      ? "text-white/75"
      : "text-ink-muted";

  return (
    <div className={`group flex items-center gap-3 min-w-0 ${className}`}>
      <LogoMark className={`flex-shrink-0 ${markClassName}`} />
      <div className="min-w-0 text-left">
        <span className="block truncate">
          <LogoBrandTitle variant={variant} />
        </span>
        {showSubtitle && (
          <span
            className={`block text-[10px] uppercase tracking-[0.2em] font-sans truncate mt-1 ${subtitleClass}`}
          >
            Elmélkedés minden napra
          </span>
        )}
      </div>
    </div>
  );
}
