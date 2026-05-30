"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Devotional } from "@/lib/types";
import { formatMonthYear } from "@/lib/calendar";
import {
  buildPublishedDevotionalDateMap,
  getSuggestedCalendarViewDate,
  getTodayDateIso,
  hasDevotional,
} from "@/lib/devotional-calendar";
import { DevotionalCalendarMonth } from "@/components/devotional/DevotionalCalendarMonth";
import { SidebarPanel } from "@/components/home/SidebarPanel";
import { IconCalendar } from "@/components/icons";

interface CalendarWidgetProps {
  devotionals: Devotional[];
}

export function CalendarWidget({ devotionals }: CalendarWidgetProps) {
  const router = useRouter();
  const byDate = useMemo(
    () => buildPublishedDevotionalDateMap(devotionals),
    [devotionals]
  );

  const [viewDate, setViewDate] = useState(() =>
    getSuggestedCalendarViewDate(devotionals)
  );
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  function goToToday() {
    const todayIso = getTodayDateIso();
    setViewDate(new Date(`${todayIso}T12:00:00`));

    if (hasDevotional(todayIso, byDate)) {
      router.push(`/devotional/${todayIso}`);
      return;
    }

    const el = document.getElementById("mai-ahitat");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <SidebarPanel id="naptar" title="Naptár" icon={<IconCalendar className="w-4 h-4" />}>
      <div className="flex items-center justify-between mb-4">
        <p className="font-serif text-base font-semibold text-ink capitalize tracking-tight">
          {formatMonthYear(year, month)}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="h-9 w-9 rounded-xl border border-ivory-200 text-ink-muted hover:text-gold-600 hover:border-gold-500/30 hover:bg-amber-50/50 text-sm transition-all duration-300"
            aria-label="Előző hónap"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="h-9 w-9 rounded-xl border border-ivory-200 text-ink-muted hover:text-gold-600 hover:border-gold-500/30 hover:bg-amber-50/50 text-sm transition-all duration-300"
            aria-label="Következő hónap"
          >
            ›
          </button>
        </div>
      </div>

      <DevotionalCalendarMonth
        devotionals={devotionals}
        year={year}
        month={month}
        variant="compact"
      />

      <button
        type="button"
        onClick={goToToday}
        className="mt-5 w-full text-xs font-medium text-ink-muted hover:text-gold-600 py-2.5 rounded-xl border border-ivory-200/80 hover:border-gold-500/25 hover:bg-amber-50/40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <IconCalendar className="w-3.5 h-3.5 flex-shrink-0" />
        Ugrás a mai napra
      </button>
    </SidebarPanel>
  );
}
