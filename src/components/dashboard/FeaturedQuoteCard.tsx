import { DashboardCard } from "@/components/ui/DashboardCard";
import { IconSun } from "@/components/icons";
import type { DisplayVerse } from "@/lib/display-verse";

interface FeaturedQuoteCardProps {
  featuredVerse: DisplayVerse;
}

export function FeaturedQuoteCard({ featuredVerse }: FeaturedQuoteCardProps) {
  return (
    <DashboardCard title="Kiemelt ige" icon={<IconSun />}>
      <div className="flex-1 flex flex-col justify-center text-center py-4 relative">
        <span
          className="absolute left-1/2 -translate-x-1/2 top-0 font-serif text-5xl text-gold-500/15 select-none"
          aria-hidden
        >
          „
        </span>
        <p className="text-xs text-gold-600 font-semibold uppercase tracking-widest mb-3">
          {featuredVerse.themeCategory}
        </p>
        <p className="font-serif text-xl md:text-2xl text-ink leading-relaxed italic">
          „{featuredVerse.text}”
        </p>
        <p className="mt-6 text-sm font-semibold text-gold-600 font-sans">
          {featuredVerse.reference}
        </p>
      </div>
    </DashboardCard>
  );
}
