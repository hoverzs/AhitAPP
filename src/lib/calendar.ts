/** Hétfővel kezdődő hét napjai (hu). */
export const WEEKDAY_LABELS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

export const MONTH_NAMES_HU = [
  "január",
  "február",
  "március",
  "április",
  "május",
  "június",
  "július",
  "augusztus",
  "szeptember",
  "október",
  "november",
  "december",
] as const;

/** Naptár cellák: null = üres padding, szám = a hónap napja. */
export function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < mondayOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export function formatMonthYear(year: number, month: number): string {
  return `${year}. ${MONTH_NAMES_HU[month]}`;
}

export function isSameMonth(a: Date, year: number, month: number): boolean {
  return a.getFullYear() === year && a.getMonth() === month;
}

/** @deprecated Használd getSuggestedCalendarViewDate (devotional-calendar.ts). */
export function getSuggestedViewDate(
  devotionals: { dayNumber: number; createdAt: string; date?: string }[]
): Date {
  if (devotionals.length === 0) return new Date();

  const sorted = [...devotionals].sort((a, b) => {
    const da = a.date ?? a.createdAt.slice(0, 10);
    const db = b.date ?? b.createdAt.slice(0, 10);
    return db.localeCompare(da);
  });
  const key = sorted[0].date ?? sorted[0].createdAt.slice(0, 10);
  const parsed = new Date(`${key}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return new Date();
}
