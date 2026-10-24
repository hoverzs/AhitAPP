import Link from "next/link";
import type { PublicDay } from "@/lib/app-data";
import { SidebarPanel } from "@/components/home/SidebarPanel";
import { IconCalendar, IconChevronRight } from "@/components/icons";

interface RecentDaysPickerProps {
  todayIso: string;
  days: PublicDay[];
}

/** YYYY-MM-DD → „okt. 24., szombat" (időzóna-független, a dátumrészekből). */
function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    weekday: "long",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Nyolcnapos dátumválasztó: a mai nap és az előző 7 nap. Csak a közzétett
 * napok kattinthatók; a retention szerint régebbi tartalom nem érhető el.
 */
export function RecentDaysPicker({ todayIso, days }: RecentDaysPickerProps) {
  return (
    <SidebarPanel
      id="elmult-napok"
      title="Elmúlt napok"
      icon={<IconCalendar className="w-4 h-4" />}
    >
      <ul className="space-y-1.5">
        {days.map(({ date, devotional }) => {
          const isToday = date === todayIso;
          const label = isToday ? `Ma · ${formatDayLabel(date)}` : formatDayLabel(date);

          if (!devotional) {
            return (
              <li key={date}>
                <div
                  className="sidebar-list-link opacity-55 cursor-default"
                  aria-disabled="true"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-muted capitalize truncate">{label}</p>
                    <p className="text-[11px] text-ink-muted/70 truncate mt-0.5">
                      Nincs közzétett áhítat
                    </p>
                  </div>
                </div>
              </li>
            );
          }

          return (
            <li key={date}>
              <Link href={`/devotional/${date}`} className="sidebar-list-link group">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm capitalize truncate ${
                      isToday ? "font-semibold text-gold-700" : "font-medium text-ink"
                    } group-hover:text-gold-600 transition-colors`}
                  >
                    {label}
                  </p>
                  <p className="text-[11px] text-ink-muted/70 truncate mt-0.5">
                    {devotional.title}
                  </p>
                </div>
                <IconChevronRight className="w-3.5 h-3.5 text-ink-muted/35 group-hover:text-gold-500 flex-shrink-0 transition-colors" />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-ink-muted/65 text-center leading-snug">
        Az áhítatok 8 napig olvashatók.
      </p>
    </SidebarPanel>
  );
}
