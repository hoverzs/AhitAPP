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

interface DevotionalCalendarProps {
  devotionals: Devotional[];
}

export function DevotionalCalendar({ devotionals }: DevotionalCalendarProps) {
  const byDayNumber = useMemo(
    () => new Map(devotionals.map((d) => [d.dayNumber, d])),
    [devotionals]
  );

  const [viewDate, setViewDate] = useState(() => getSuggestedViewDate(devotionals));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildMonthGrid(year, month);
  const today = new Date();
  const publishedCount = devotionals.length;

  function goToPrevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }

  function goToNextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }

  function goToToday() {
    setViewDate(new Date());
  }

  return (
    <div className="rounded-3xl border border-parchment-200 bg-white/80 shadow-soft overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-5 border-b border-parchment-100 bg-gradient-to-r from-parchment-50 to-amber-50/40">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-600">
            Havi áttekintés
          </p>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold text-slate-800 mt-1 capitalize">
            {formatMonthYear(year, month)}
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="h-10 w-10 rounded-full border border-parchment-200 bg-white text-slate-600 hover:border-gold-400/50 hover:text-gold-600 transition-colors"
            aria-label="Előző hónap"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="h-10 px-4 rounded-full border border-parchment-200 bg-white text-sm font-medium text-slate-600 hover:border-gold-400/50 hover:text-gold-600 transition-colors"
          >
            Ma
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="h-10 w-10 rounded-full border border-parchment-200 bg-white text-slate-600 hover:border-gold-400/50 hover:text-gold-600 transition-colors"
            aria-label="Következő hónap"
          >
            ›
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 py-2"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label="Áhítat naptár">
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="aspect-square" aria-hidden />;
            }

            const devotional = byDayNumber.get(day);
            const hasDevotional = Boolean(devotional);
            const isToday =
              isSameMonth(today, year, month) && today.getDate() === day;

            const baseClasses =
              "aspect-square rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all relative";

            const emptyClasses =
              "bg-parchment-50/80 text-slate-400 cursor-default border border-transparent";

            const filledClasses =
              "bg-gradient-to-br from-amber-50 to-amber-100/90 text-gold-600 border border-gold-400/35 shadow-sm hover:shadow-md hover:border-gold-500/50 hover:from-amber-100 hover:to-amber-50 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-gold-400/40";

            const todayRing = isToday
              ? "ring-2 ring-gold-400/60 ring-offset-2 ring-offset-white"
              : "";

            const dayLabel = (
              <>
                <span
                  className={`text-sm sm:text-base font-semibold ${
                    hasDevotional ? "text-gold-700" : ""
                  }`}
                >
                  {day}
                </span>
                {hasDevotional && (
                  <span className="hidden sm:block text-[10px] font-medium text-gold-600/80 max-w-[90%] truncate px-1">
                    {devotional!.title}
                  </span>
                )}
                {hasDevotional && (
                  <span
                    className="sm:hidden absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-gold-500"
                    aria-hidden
                  />
                )}
              </>
            );

            if (hasDevotional) {
              return (
                <Link
                  key={day}
                  href={`/nap/${devotional!.dayNumber}`}
                  className={`${baseClasses} ${filledClasses} ${todayRing}`}
                  title={`${day}. nap: ${devotional!.title}`}
                  role="gridcell"
                >
                  {dayLabel}
                </Link>
              );
            }

            return (
              <div
                key={day}
                className={`${baseClasses} ${emptyClasses} ${todayRing}`}
                role="gridcell"
                aria-label={`${day}. nap — még nincs áhítat`}
              >
                {dayLabel}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-parchment-100 bg-parchment-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-md bg-gradient-to-br from-amber-50 to-amber-100 border border-gold-400/35" />
            Közzétett nap
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-md bg-parchment-50 border border-parchment-200" />
            Üres nap
          </span>
        </div>
        <p>
          {publishedCount === 0 ? (
            <>Még nincs közzétett nap — az első áhítat az admin felületről készíthető.</>
          ) : (
            <>
              <span className="font-medium text-gold-600">{publishedCount}</span> / 30 nap
              elkészült
            </>
          )}
        </p>
      </div>
    </div>
  );
}
