"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Devotional } from "@/lib/types";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatMonthYear,
} from "@/lib/calendar";
import {
  addCalendarMonths,
  buildPublishedDevotionalDateMap,
  formatCalendarDateIso,
  getDefaultCalendarViewMonth,
  getDevotionalHref,
  getTodayDateIso,
  hasDevotional,
  initCalendarDateContext,
  isCalendarToday,
  type CalendarViewMonth,
} from "@/lib/devotional-calendar";
import { getAppTodayParts } from "@/lib/app-date";
import { SidebarPanel } from "@/components/home/SidebarPanel";
import { IconCalendar } from "@/components/icons";

interface CalendarWidgetProps {
  devotionals: Devotional[];
}

/**
 * Oldalsáv naptár — minden közzétett nap kattintható Link (/devotional/YYYY-MM-DD).
 */
export function CalendarWidget({ devotionals }: CalendarWidgetProps) {
  const router = useRouter();

  const byDate = useMemo(
    () => buildPublishedDevotionalDateMap(devotionals),
    [devotionals]
  );

  const [viewMonth, setViewMonth] = useState<CalendarViewMonth>(() =>
    initCalendarDateContext("CalendarWidget", getDefaultCalendarViewMonth())
  );

  const { year, monthIndex: month } = viewMonth;
  const cells = buildMonthGrid(year, month);
  const todayIso = getTodayDateIso();

  useEffect(() => {
    initCalendarDateContext("CalendarWidget:mount", viewMonth);
  }, [viewMonth]);

  function goToToday() {
    const today = getAppTodayParts();
    setViewMonth({ year: today.year, monthIndex: today.monthIndex });

    if (hasDevotional(todayIso, byDate)) {
      router.push(getDevotionalHref(todayIso));
      return;
    }

    document.getElementById("mai-ahitat")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <SidebarPanel id="naptar" title="Naptár" icon={<IconCalendar className="w-4 h-4" />}>
      <div className="flex items-center justify-between mb-4">
        <p className="font-serif text-base font-semibold text-ink capitalize tracking-tight">
          {formatMonthYear(year, month)}
        </p>
        <div className="flex gap-1.5 relative z-20">
          <button
            type="button"
            onClick={() => setViewMonth((v) => addCalendarMonths(v, -1))}
            className="h-9 w-9 rounded-xl border border-ivory-200 text-ink-muted hover:text-gold-600 hover:border-gold-500/30 hover:bg-amber-50/50 text-sm transition-all duration-300 cursor-pointer"
            aria-label="Előző hónap"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((v) => addCalendarMonths(v, 1))}
            className="h-9 w-9 rounded-xl border border-ivory-200 text-ink-muted hover:text-gold-600 hover:border-gold-500/30 hover:bg-amber-50/50 text-sm transition-all duration-300 cursor-pointer"
            aria-label="Következő hónap"
          >
            ›
          </button>
        </div>
      </div>

      <div className="calendar-widget relative z-10 pointer-events-auto">
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-center text-[10px] font-semibold text-ink-muted/80 py-1 uppercase tracking-wider"
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className="grid grid-cols-7 gap-1.5"
          role="grid"
          aria-label="Áhítat naptár"
        >
          {cells.map((day, index) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${index}`}
                  className="aspect-square"
                  aria-hidden
                />
              );
            }

            const dateIso = formatCalendarDateIso(year, month, day);
            const devotional = byDate.get(dateIso);
            const hasEntry = Boolean(devotional);
            const isToday = isCalendarToday(year, month, day, todayIso);

            const todayClass = isToday ? "calendar-day--today" : "";

            if (hasEntry && devotional) {
              const href = getDevotionalHref(dateIso);

              return (
                <Link
                  key={dateIso}
                  href={href}
                  prefetch
                  className={`calendar-day calendar-day-link calendar-day--filled ${todayClass}`}
                  title={devotional.title}
                  aria-label={`${dateIso}: ${devotional.title}`}
                  role="gridcell"
                >
                  {day}
                </Link>
              );
            }

            return (
              <span
                key={dateIso}
                className={`calendar-day calendar-day--empty ${todayClass}`}
                role="gridcell"
                aria-disabled="true"
                aria-label={`${dateIso}: nincs áhítat`}
              >
                {day}
              </span>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={goToToday}
        className="mt-4 w-full text-xs font-medium text-ink-muted hover:text-gold-600 py-2.5 rounded-xl border border-gold-500/15 hover:border-gold-500/30 hover:bg-amber-50/50 transition-all flex items-center justify-center gap-2 cursor-pointer relative z-10"
      >
        <IconCalendar className="w-3.5 h-3.5 flex-shrink-0" />
        Ugrás a mai napra
      </button>
    </SidebarPanel>
  );
}
