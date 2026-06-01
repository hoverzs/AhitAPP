/**
 * Ellenőrzés: Europe/Bucharest „ma” — pl. 2026-06-01 00:55 helyi idő.
 * Futtatás: npx tsx scripts/verify-app-date.ts
 */
import {
  APP_TIMEZONE,
  getAppTodayIso,
  getAppTodayParts,
  isSameCalendarDay,
} from "../src/lib/app-date";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
  console.log("OK:", message);
}

/** 2026-06-01 00:55 Europe/Bucharest ≈ 2026-05-31T21:55:00.000Z (EEST, UTC+3) */
const june1Local = new Date("2026-05-31T21:55:00.000Z");

const todayIso = getAppTodayIso(june1Local);
assert(todayIso === "2026-06-01", `todayIso = ${todayIso} (expected 2026-06-01)`);

const parts = getAppTodayParts(june1Local);
assert(parts.year === 2026 && parts.monthIndex === 5 && parts.day === 1, "parts = June 1");

assert(
  parts.monthIndex === 5,
  "default visible month should be June (monthIndex 5)"
);

assert(
  isSameCalendarDay(2026, 5, 1, todayIso),
  "June 1 highlighted as today"
);

assert(
  !isSameCalendarDay(2026, 4, 31, todayIso),
  "May 31 is not today"
);

console.log("\nAll checks passed.", {
  timezone: APP_TIMEZONE,
  todayIso,
  calendarMonth: { year: parts.year, monthIndex: parts.monthIndex },
});
