import Link from "next/link";
import type { Devotional } from "@/lib/types";
import { SidebarPanel } from "@/components/home/SidebarPanel";
import { IconCalendar, IconChevronRight } from "@/components/icons";
import { formatShortDate } from "@/lib/dashboard";

interface RecentDevotionalsListProps {
  devotionals: Devotional[];
}

export function RecentDevotionalsList({ devotionals }: RecentDevotionalsListProps) {
  const recent = [...devotionals]
    .sort((a, b) => b.dayNumber - a.dayNumber)
    .slice(0, 3);

  return (
    <SidebarPanel title="Legutóbbi áhítatok" icon={<IconCalendar className="w-4 h-4" />}>
      {recent.length === 0 ? (
        <p className="text-sm text-ink-muted/75 italic py-2 text-center font-serif">
          Még nincs közzétett áhítat.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((d) => {
            const ref = d.verse.split("—")[0]?.trim() ?? d.verse;
            const dateLabel = formatShortDate(d.createdAt);

            return (
              <li key={d.dayNumber}>
                <Link
                  href={d.date ? `/devotional/${d.date}` : `/nap/${d.dayNumber}`}
                  className="sidebar-list-link group"
                >
                  <span className="sidebar-list-badge">{d.dayNumber}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink group-hover:text-gold-600 transition-colors truncate">
                      {d.title}
                    </p>
                    <p className="text-[11px] text-ink-muted/70 truncate mt-0.5">
                      {dateLabel || ref}
                    </p>
                  </div>
                  <IconChevronRight className="w-3.5 h-3.5 text-ink-muted/35 group-hover:text-gold-500 flex-shrink-0 transition-colors" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarPanel>
  );
}
