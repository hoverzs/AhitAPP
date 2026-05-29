"use client";

import Image from "next/image";
import { HERO_IMAGE } from "@/lib/image-assets";
import Link from "next/link";
import { IconSearch, IconSun } from "@/components/icons";
import { LogoBrand } from "@/components/Logo";
import { SiteNav } from "@/components/SiteNav";
import { AdminNavLink } from "@/components/AdminNavLink";
import { HeroQuote } from "@/components/HeroQuote";

interface SiteHeaderProps {
  todayHref: string;
}

export function SiteHeader({ todayHref }: SiteHeaderProps) {
  const currentYear = new Date().getFullYear();

  return (
    <header className="site-hero">
      <div className="site-hero-inner">
        <div className="site-hero-media" aria-hidden>
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            priority
            className="animate-hero-drift object-cover object-[center_42%]"
            sizes="100vw"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/20 via-ink/[0.03] to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/15 via-transparent to-transparent" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/10 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ivory-50 via-ivory-50/40 to-transparent pointer-events-none z-[5]" />
        </div>

        <div className="relative z-10 glass-nav shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              <Link href="/" className="group min-w-0 hover:opacity-95 transition-opacity shrink-0">
                <LogoBrand />
              </Link>

              <SiteNav todayHref={todayHref} variant="glass" />

              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <AdminNavLink variant="glass" />
                <button
                  type="button"
                  className="h-10 w-10 rounded-xl border border-white/55 bg-white/50 text-ink hover:bg-white/70 backdrop-blur-sm flex items-center justify-center transition-all duration-300 shadow-sm"
                  aria-label="Keresés (hamarosan)"
                >
                  <IconSearch />
                </button>
                <label className="sr-only" htmlFor="year-select">
                  Év
                </label>
                <select
                  id="year-select"
                  defaultValue={String(currentYear)}
                  className="hidden sm:block h-10 rounded-xl border border-white/55 bg-white/50 backdrop-blur-sm px-3 text-sm text-ink focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-400/30 shadow-sm"
                  aria-label="Év kiválasztása"
                >
                  <option value={String(currentYear - 1)}>{currentYear - 1}</option>
                  <option value={String(currentYear)}>{currentYear}</option>
                  <option value={String(currentYear + 1)}>{currentYear + 1}</option>
                </select>
                <button
                  type="button"
                  className="h-10 w-10 rounded-xl border border-white/55 bg-white/50 text-gold-600 hover:bg-white/70 backdrop-blur-sm flex items-center justify-center transition-all duration-300 shadow-sm"
                  aria-label="Megjelenés (hamarosan)"
                >
                  <IconSun />
                </button>
              </div>
            </div>

            <nav
              className="flex md:hidden gap-1 mt-3 overflow-x-auto pb-0.5 max-w-full"
              aria-label="Mobil navigáció"
            >
              <Link href="/" className="site-nav-link bg-white/65 text-ink border border-white/45 whitespace-nowrap text-xs px-3 py-1.5">
                Kezdőlap
              </Link>
              <Link href={todayHref} className="site-nav-link text-ink-muted hover:bg-white/45 whitespace-nowrap text-xs px-3 py-1.5">
                Mai nap
              </Link>
              <Link href="/#naptar" className="site-nav-link text-ink-muted hover:bg-white/45 whitespace-nowrap text-xs px-3 py-1.5">
                Archívum
              </Link>
              <Link href="/admin/login" className="site-nav-link text-ink-muted/80 hover:bg-white/45 hover:text-gold-600 whitespace-nowrap text-xs px-3 py-1.5">
                Admin
              </Link>
            </nav>
          </div>
        </div>

        <div className="relative z-10 mt-auto pb-6 sm:pb-10 md:pb-14 shrink-0">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <div className="hero-quote-panel w-full max-w-xl px-4 py-4 sm:px-8 sm:py-8">
              <HeroQuote variant="hero" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
