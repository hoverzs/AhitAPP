"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Devotional } from "@/lib/types";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatMonthYear,
  getSuggestedViewDate,
  isSameMonth,
} from "@/lib/calendar";
import { SidebarPanel } from "@/components/home/SidebarPanel";
import { IconCalendar } from "@/components/icons";

interface CalendarWidgetProps {
  devotionals: Devotional[];
}

export function CalendarWidget({ devotionals }: CalendarWidgetProps) {
  const byDayNumber = useMemo(
    () => new Map(devotionals.map((d) => [d.dayNumber, d])),
    [devotionals]
  );

  const [viewDate, setViewDate] = useState(() => getSuggestedViewDate(devotionals));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildMonthGrid(year, month);
  const today = new Date();

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

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`e-${index}`} className="aspect-square" aria-hidden />;
            }

            const devotional = byDayNumber.get(day);
            const hasDevotional = Boolean(devotional);
            const isToday =
              isSameMonth(today, year, month) && today.getDate() === day;

            const cellClass = hasDevotional
              ? "bg-gradient-to-br from-amber-50/90 to-gold-500/15 text-gold-600 font-semibold border border-gold-500/25 hover:shadow-soft hover:border-gold-500/40"
              : "text-ink-muted hover:bg-ivory-100/80 border border-transparent";

            const todayClass = isToday
              ? "ring-2 ring-gold-500/70 ring-offset-2 ring-offset-ivory-50"
              : "";

            const inner = <span className="text-xs sm:text-sm">{day}</span>;

            if (hasDevotional) {
              return (
                <Link
                  key={day}
                  href={`/nap/${devotional!.dayNumber}`}
                  className={`aspect-square rounded-xl flex items-center justify-center transition-all duration-300 ${cellClass} ${todayClass}`}
                  title={devotional!.title}
                >
                  {inner}
                </Link>
              );
            }

            return (
              <div
                key={day}
                className={`aspect-square rounded-xl flex items-center justify-center transition-colors duration-300 ${cellClass} ${todayClass}`}
              >
                {inner}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setViewDate(new Date())}
          className="mt-5 w-full text-xs font-medium text-ink-muted hover:text-gold-600 py-2.5 rounded-xl border border-ivory-200/80 hover:border-gold-500/25 hover:bg-amber-50/40 transition-colors flex items-center justify-center gap-2"
        >
          <IconCalendar className="w-3.5 h-3.5 flex-shrink-0" />
          Ugrás a mai napra
        </button>
    </SidebarPanel>
  );
}
