import Link from "next/link";
import type { Devotional } from "@/lib/types";
import { DevotionalArticleLayout } from "@/components/devotional/DevotionalArticleLayout";
import { formatDevotionalDate } from "@/lib/devotional-excerpt";
import { STATIC_EXCERPT } from "@/lib/fallbacks";

interface FeaturedTodayDevotionalProps {
  devotional: Devotional | null;
}

export function FeaturedTodayDevotional({ devotional }: FeaturedTodayDevotionalProps) {
  if (!devotional) {
    return (
      <article className="editorial-feature">
        <div className="editorial-feature-inner text-center max-w-lg mx-auto">
          <p className="editorial-eyebrow">Mai áhítat</p>
          <h1 className="editorial-title mt-3">Még nincs közzétett áhítat</h1>
          <p className="mt-6 text-ink-muted font-serif text-lg leading-relaxed">
            {STATIC_EXCERPT}
          </p>
          <Link href="/admin/login" className="btn-primary mt-10 inline-flex">
            Admin belépés
          </Link>
        </div>
      </article>
    );
  }

  const dateLabel = formatDevotionalDate(devotional.date ?? devotional.createdAt);

  return (
    <article className="editorial-feature" id="mai-ahitat">
      <div className="editorial-feature-inner editorial-feature-inner--article max-w-[840px]">
        <header className="text-center mb-8 md:mb-10">
          <p className="editorial-eyebrow">
            Mai áhítat
            {dateLabel && (
              <>
                <span className="mx-2 text-gold-500/40" aria-hidden>
                  ·
                </span>
                {dateLabel}
              </>
            )}
          </p>
          <h1 className="editorial-title mt-4">{devotional.title}</h1>
          {devotional.category && (
            <p className="mt-3 text-sm font-medium text-gold-600/90 tracking-wide">
              {devotional.category}
            </p>
          )}
        </header>

        <DevotionalArticleLayout
          content={devotional.content}
          verse={devotional.verse}
          dayNumber={devotional.dayNumber}
          title={devotional.title}
          category={devotional.category}
          imageUrl={devotional.imageUrl}
          imageMeta={devotional}
          showHeader={false}
          priorityImage
        />
      </div>
    </article>
  );
}
