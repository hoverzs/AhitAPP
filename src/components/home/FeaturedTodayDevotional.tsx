import Link from "next/link";
import type { Devotional } from "@/lib/types";
import { DevotionalContent } from "@/components/devotional/DevotionalContent";
import { DevotionalIllustration } from "@/components/DevotionalIllustration";
import { ImageCredit } from "@/components/ImageCredit";
import { hasAssignedDevotionalImage } from "@/lib/image-assets";
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
      <div className="editorial-feature-inner">
        <header className="max-w-3xl mx-auto text-center lg:text-left lg:mx-0">
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

        <div className="mt-10 lg:mt-12 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <figure className="order-1 lg:order-2 m-0 lg:sticky lg:top-24">
            <div className="relative aspect-[4/5] sm:aspect-[5/6] lg:aspect-[4/5] rounded-2xl overflow-hidden border border-ivory-200/80 shadow-[0_20px_50px_-20px_rgba(23,32,51,0.15)]">
              <DevotionalIllustration
                imageUrl={devotional.imageUrl}
                alt={devotional.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 480px"
                priority
                allowFallback
              />
            </div>
            <figcaption className="mt-3 text-center lg:text-left space-y-1">
              <span className="block text-xs text-ink-muted/70">
                {devotional.dayNumber}. nap
              </span>
              {hasAssignedDevotionalImage(devotional.imageUrl) && (
                <ImageCredit devotional={devotional} className="text-center lg:text-left" />
              )}
            </figcaption>
          </figure>

          <div className="order-2 lg:order-1 editorial-full-content min-w-0">
            <DevotionalContent content={devotional.content} verse={devotional.verse} />
          </div>
        </div>
      </div>
    </article>
  );
}
