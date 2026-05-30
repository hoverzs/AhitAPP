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

interface DevotionalCalendarProps {
  devotionals: Devotional[];
}

export function DevotionalCalendar({ devotionals }: DevotionalCalendarProps) {
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
  const publishedCount = devotionals.length;

  function goToPrevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }

  function goToNextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }

  function goToToday() {
    const todayIso = getTodayDateIso();
    setViewDate(new Date(`${todayIso}T12:00:00`));

    if (hasDevotional(todayIso, byDate)) {
      router.push(`/devotional/${todayIso}`);
    }
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
            className="h-10 w-10 rounded-full border border-parchment-200 bg-white text-slate-600 hover:border-gold-400/50 hover:text-gold-600 transition-colors cursor-pointer"
            aria-label="Előző hónap"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="h-10 px-4 rounded-full border border-parchment-200 bg-white text-sm font-medium text-slate-600 hover:border-gold-400/50 hover:text-gold-600 transition-colors cursor-pointer"
          >
            Ma
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="h-10 w-10 rounded-full border border-parchment-200 bg-white text-slate-600 hover:border-gold-400/50 hover:text-gold-600 transition-colors cursor-pointer"
            aria-label="Következő hónap"
          >
            ›
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <DevotionalCalendarMonth
          devotionals={devotionals}
          year={year}
          month={month}
          variant="full"
        />
      </div>

      <div className="px-6 py-4 border-t border-parchment-100 bg-parchment-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-md bg-gradient-to-br from-amber-50 to-amber-100 border border-gold-400/35" />
            Közzétett nap
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-md bg-parchment-50 border border-parchment-200 opacity-60" />
            Üres nap
          </span>
        </div>
        <p>
          {publishedCount === 0 ? (
            <>Még nincs közzétett nap — az első áhítat az admin felületről készíthető.</>
          ) : (
            <>
              <span className="font-medium text-gold-600">{publishedCount}</span> közzétett
              áhítat
            </>
          )}
        </p>
      </div>
    </div>
  );
}
