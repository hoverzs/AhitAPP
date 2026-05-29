"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
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

function HeroBackground() {
  return (
    <>
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
      <div className="absolute inset-0 bg-gradient-to-b from-ink/25 via-ink/10 to-ivory-50/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/15 via-transparent to-transparent" />
    </>
  );
}

export function SiteHeader({ todayHref }: SiteHeaderProps) {
  const currentYear = new Date().getFullYear();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isToday = pathname.startsWith("/nap/") || pathname === "/mai";

  return (
    <>
      <header className="site-hero">
        <div className="site-hero-inner">
          {/* Háttérkép — csak asztali nézetben teljes hero */}
          <div className="site-hero-media site-hero-media--desktop" aria-hidden>
            <HeroBackground />
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/10 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ivory-50 via-ivory-50/40 to-transparent pointer-events-none z-[5]" />
          </div>

          <div className="relative z-10 glass-nav shrink-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-4">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <Link
                  href="/"
                  className="group min-w-0 flex-1 hover:opacity-95 transition-opacity"
                >
                  <LogoBrand
                    showSubtitle={false}
                    markClassName="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12"
                    className="max-w-[min(100%,14rem)] sm:max-w-none"
                  />
                </Link>

                <SiteNav todayHref={todayHref} variant="glass" />

                <div className="hidden md:flex items-center gap-2 sm:gap-3 flex-shrink-0">
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
                    className="h-10 rounded-xl border border-white/55 bg-white/50 backdrop-blur-sm px-3 text-sm text-ink focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-400/30 shadow-sm"
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
                className="site-hero-mobile-nav md:hidden"
                aria-label="Mobil navigáció"
              >
                <Link
                  href="/"
                  className={`site-nav-link site-nav-link-mobile ${isHome ? "site-nav-link-mobile-active" : ""}`}
                >
                  Kezdőlap
                </Link>
                <Link
                  href={todayHref}
                  className={`site-nav-link site-nav-link-mobile ${isToday ? "site-nav-link-mobile-active" : ""}`}
                >
                  Mai nap
                </Link>
                <Link href="/#naptar" className="site-nav-link site-nav-link-mobile">
                  Archívum
                </Link>
                <Link
                  href="/admin/login"
                  className="site-nav-link site-nav-link-mobile"
                >
                  Admin
                </Link>
              </nav>
            </div>
          </div>

          {/* Mobil: rövid képcsík (idézet alatta külön blokkban) */}
          <div className="site-hero-media site-hero-media--mobile md:hidden" aria-hidden>
            <HeroBackground />
          </div>

          {/* Asztali: idézet a kép fölött */}
          <div className="hidden md:block relative z-10 mt-auto pb-10 md:pb-14 shrink-0">
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
              <div className="hero-quote-panel w-full max-w-xl px-6 py-6 sm:px-8 sm:py-8">
                <HeroQuote variant="hero" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobil: teljes idézet — nem a képen, hanem alatta, olvasható háttérrel */}
      <section className="hero-quote-mobile-section md:hidden" aria-label="Napi idézet">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <HeroQuote variant="mobile" />
        </div>
      </section>
    </>
  );
}
