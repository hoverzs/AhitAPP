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
        <p className="text-sm text-ink-muted/80 italic py-2 text-center font-serif">
          Még nincs közzétett áhítat.
        </p>
      ) : (
        <ul className="space-y-2">
          {recent.map((d) => {
            const ref = d.verse.split("—")[0]?.trim() ?? d.verse;
            const dateLabel = formatShortDate(d.createdAt);

            return (
              <li key={d.dayNumber}>
                <Link
                  href={`/nap/${d.dayNumber}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-amber-50/50 group"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ivory-100/80 text-gold-600/80 text-xs font-semibold">
                    {d.dayNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink group-hover:text-gold-700 transition-colors truncate">
                      {d.title}
                    </p>
                    <p className="text-[11px] text-ink-muted/75 truncate mt-0.5">
                      {dateLabel || ref}
                    </p>
                  </div>
                  <IconChevronRight className="w-3.5 h-3.5 text-ink-muted/40 group-hover:text-gold-600 flex-shrink-0 transition-colors" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarPanel>
  );
}
