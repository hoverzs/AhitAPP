"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Kezdőlap", match: (p: string) => p === "/" },
  {
    href: "/mai",
    label: "Mai nap",
    match: (p: string) => p.startsWith("/nap/") || p === "/mai",
  },
  { href: "/#naptar", label: "Archívum", match: () => false },
] as const;

interface SiteNavProps {
  todayHref: string;
  variant?: "default" | "hero" | "glass";
}

export function SiteNav({ todayHref, variant = "default" }: SiteNavProps) {
  const pathname = usePathname();
  const isGlass = variant === "glass";
  const isHero = variant === "hero";

  return (
    <nav className="hidden md:flex items-center gap-1" aria-label="Fő navigáció">
      {links.map((link) => {
        const href = link.label === "Mai nap" ? todayHref : link.href;
        const active = link.match(pathname);

        return (
          <Link
            key={link.label}
            href={href}
            className={`site-nav-link ${
              isGlass
                ? active
                  ? "text-gold-600 bg-white/55 shadow-sm"
                  : "text-ink hover:text-gold-600 hover:bg-white/40"
                : isHero
                  ? active
                    ? "text-amber-200 bg-white/15"
                    : "text-white/90 hover:text-white hover:bg-white/10"
                  : active
                    ? "text-gold-600 bg-gold-500/10"
                    : "text-ink-muted hover:text-gold-600 hover:bg-ivory-100"
            }`}
          >
            {link.label}
            {active && (
              <span
                className={`block mx-auto mt-0.5 h-0.5 w-6 rounded-full ${
                  isGlass ? "bg-gold-500" : isHero ? "bg-amber-300" : "bg-gold-500"
                }`}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
