"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteHeaderCompact } from "@/components/SiteHeaderCompact";

interface SiteHeaderSwitcherProps {
  todayHref: string;
}

export function SiteHeaderSwitcher({ todayHref }: SiteHeaderSwitcherProps) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  const isHome = pathname === "/";

  if (isHome) {
    return <SiteHeader todayHref={todayHref} />;
  }

  return <SiteHeaderCompact todayHref={todayHref} />;
}
