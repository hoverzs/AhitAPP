import Link from "next/link";
import type { Devotional } from "@/lib/types";
import { DevotionalIllustration } from "@/components/DevotionalIllustration";
import { ImageCredit } from "@/components/ImageCredit";
import { hasAssignedDevotionalImage } from "@/lib/image-assets";
import { DevotionalMarkdown } from "@/components/devotional/DevotionalMarkdown";
import {
  extractDevotionalExcerpt,
  formatDevotionalDate,
  parseVerseDisplay,
} from "@/lib/devotional-excerpt";
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

  const { reference, text: verseText } = parseVerseDisplay(devotional.verse);
  const excerpt = extractDevotionalExcerpt(devotional.content, 3);
  const dateLabel = formatDevotionalDate(devotional.date ?? devotional.createdAt);
  const href = `/nap/${devotional.dayNumber}`;

  return (
    <article className="editorial-feature">
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

        <div className="mt-10 lg:mt-14 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div className="order-2 lg:order-1 flex flex-col gap-8">
            {(verseText || reference) && (
              <figure className="editorial-verse">
                {reference && (
                  <figcaption className="editorial-verse-ref">{reference}</figcaption>
                )}
                {verseText && (
                  <blockquote className="editorial-verse-text">
                    <p>„{verseText}”</p>
                  </blockquote>
                )}
              </figure>
            )}

            {excerpt && (
              <div className="editorial-excerpt">
                <DevotionalMarkdown source={excerpt} />
              </div>
            )}

            <div className="pt-2">
              <Link href={href} className="btn-editorial group">
                Tovább olvasom
                <span aria-hidden className="ml-2 transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </div>
          </div>

          <figure className="order-1 lg:order-2 m-0">
            <Link
              href={href}
              className="group block relative aspect-[4/5] sm:aspect-[5/6] lg:aspect-[4/5] rounded-2xl overflow-hidden border border-ivory-200/80 shadow-[0_20px_50px_-20px_rgba(23,32,51,0.15)]"
            >
              <DevotionalIllustration
                imageUrl={devotional.imageUrl}
                alt={devotional.title}
                fill
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                sizes="(max-width: 1024px) 100vw, 480px"
                priority
                allowFallback
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-ink/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                aria-hidden
              />
            </Link>
            <figcaption className="mt-3 text-center lg:text-left space-y-1">
              <span className="block text-xs text-ink-muted/70">
                {devotional.dayNumber}. nap
              </span>
              {hasAssignedDevotionalImage(devotional.imageUrl) && (
                <ImageCredit devotional={devotional} className="text-center lg:text-left" />
              )}
            </figcaption>
          </figure>
        </div>
      </div>
    </article>
  );
}
