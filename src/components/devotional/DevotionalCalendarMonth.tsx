"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Devotional } from "@/lib/types";
import { WEEKDAY_LABELS, buildMonthGrid } from "@/lib/calendar";
import {
  buildPublishedDevotionalDateMap,
  formatCalendarDateIso,
  getDevotionalByCalendarDate,
  getDevotionalHref,
  getTodayDateIso,
  hasDevotional,
  isCalendarToday,
} from "@/lib/devotional-calendar";

export interface DevotionalCalendarMonthProps {
  devotionals: Devotional[];
  year: number;
  month: number;
  /** Kompakt sidebar vs. teljes naptár */
  variant?: "compact" | "full";
}

export function DevotionalCalendarMonth({
  devotionals,
  year,
  month,
  variant = "compact",
}: DevotionalCalendarMonthProps) {
  const byDate = useMemo(
    () => buildPublishedDevotionalDateMap(devotionals),
    [devotionals]
  );
  const cells = buildMonthGrid(year, month);
  const todayIso = getTodayDateIso();
  const isFull = variant === "full";

  return (
    <>
      <div
        className={`grid grid-cols-7 ${isFull ? "gap-1 sm:gap-2 mb-2" : "gap-1.5 mb-2"}`}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className={
              isFull
                ? "text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 py-2"
                : "text-center text-[10px] font-semibold text-ink-muted/80 py-1 uppercase tracking-wider"
            }
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className={`grid grid-cols-7 ${isFull ? "gap-1 sm:gap-2" : "gap-1.5"}`}
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
          const devotional = getDevotionalByCalendarDate(year, month, day, byDate);
          const hasEntry = hasDevotional(dateIso, byDate);
          const isToday = isCalendarToday(year, month, day, todayIso);

          const todayClass = isToday ? "calendar-day--today" : "";
          const dayLabel = isFull ? (
            <>
              <span
                className={`text-sm sm:text-base font-semibold ${
                  hasEntry ? "text-gold-700" : ""
                }`}
              >
                {day}
              </span>
              {hasEntry && devotional && (
                <span className="hidden sm:block text-[10px] font-medium text-gold-600/80 max-w-[90%] truncate px-1">
                  {devotional.title}
                </span>
              )}
              {hasEntry && (
                <span
                  className="sm:hidden absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-gold-500"
                  aria-hidden
                />
              )}
            </>
          ) : (
            <span className="text-xs sm:text-sm">{day}</span>
          );

          if (hasEntry && devotional) {
            const href = getDevotionalHref(dateIso);

            return (
              <Link
                key={dateIso}
                href={href}
                prefetch
                className={`calendar-day calendar-day-link calendar-day--filled ${todayClass} ${
                  isFull ? "flex-col gap-0.5" : ""
                }`}
                title={`${dateIso}: ${devotional.title}`}
                role="gridcell"
                aria-label={`${day}. — ${devotional.title}`}
              >
                {dayLabel}
              </Link>
            );
          }

          return (
            <div
              key={dateIso}
              className={`calendar-day calendar-day--empty ${todayClass} ${
                isFull ? "flex-col gap-0.5" : ""
              }`}
              role="gridcell"
              aria-disabled="true"
              aria-label={`${day}. — nincs közzétett áhítat`}
            >
              {dayLabel}
            </div>
          );
        })}
      </div>
    </>
  );
}
