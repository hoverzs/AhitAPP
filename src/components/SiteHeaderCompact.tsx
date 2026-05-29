"use client";

import Link from "next/link";
import { LogoBrand } from "@/components/Logo";
import { SiteNav } from "@/components/SiteNav";
import { AdminNavLink } from "@/components/AdminNavLink";

interface SiteHeaderCompactProps {
  todayHref: string;
}

/** Egyszerű sáv admin és áhítat oldalakon — nem takarja ki a tartalmat. */
export function SiteHeaderCompact({ todayHref }: SiteHeaderCompactProps) {
  return (
    <header className="border-b border-ivory-200/90 bg-ivory-50/95 backdrop-blur-xl sticky top-0 z-50 shadow-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group min-w-0">
            <LogoBrand showSubtitle={false} markClassName="w-10 h-10" />
          </Link>
          <div className="flex items-center gap-3 flex-shrink-0">
            <SiteNav todayHref={todayHref} variant="default" />
            <AdminNavLink variant="default" />
          </div>
        </div>
      </div>
    </header>
  );
}
