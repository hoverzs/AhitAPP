import Link from "next/link";
import type { Devotional } from "@/lib/types";
import { DevotionalIllustration } from "@/components/DevotionalIllustration";
import { DashboardCard } from "@/components/ui/DashboardCard";

interface HeroImageCardProps {
  devotional: Devotional | null;
}

export function HeroImageCard({ devotional }: HeroImageCardProps) {
  const href = devotional ? `/nap/${devotional.dayNumber}` : "/admin";

  return (
    <DashboardCard title="Mai áhítat" flush>
      <Link
        href={href}
        className="group relative block flex-1 min-h-[280px] md:min-h-[320px] overflow-hidden"
      >
        {devotional ? (
          <DevotionalIllustration
            imageUrl={devotional.imageUrl}
            alt={devotional.title}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 33vw"
            priority
            allowFallback
          />
        ) : (
          <DevotionalIllustration
            imageUrl=""
            alt="Helyőrző"
            fill
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/5 to-transparent transition-opacity duration-500 group-hover:from-ink/60 pointer-events-none" />
        {devotional && (
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white pointer-events-none">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400 mb-1.5 font-sans font-medium">
              {devotional.dayNumber}. nap
            </p>
            <p className="font-serif text-xl md:text-2xl font-semibold leading-snug">
              {devotional.title}
            </p>
          </div>
        )}
      </Link>
    </DashboardCard>
  );
}
