import { DevotionalIllustration } from "@/components/DevotionalIllustration";
import { ImageCredit } from "@/components/ImageCredit";
import { hasAssignedDevotionalImage } from "@/lib/image-assets";
import type { Devotional } from "@/lib/types";
import {
  DevotionalSectionCard,
  getDevotionalSections,
} from "./DevotionalContent";

export interface DevotionalArticleLayoutProps {
  content: string;
  verse?: string;
  dayNumber: number;
  title: string;
  category?: string;
  imageUrl: string;
  imageMeta: Pick<
    Devotional,
    "imageSource" | "imageCredit" | "imagePhotographerUrl" | "imageUrl"
  >;
  /** Napi oldal: cím + kategória felül. Főoldal: a szülő adja a fejlécet. */
  showHeader?: boolean;
  priorityImage?: boolean;
}

/**
 * Editorial article layout: cím → alapige → landscape kép → szövegszekciók.
 * Egyoszlopos, nincs kép/szöveg kétoszlop.
 */
export function DevotionalArticleLayout({
  content,
  verse,
  dayNumber,
  title,
  category,
  imageUrl,
  imageMeta,
  showHeader = true,
  priorityImage = false,
}: DevotionalArticleLayoutProps) {
  const sections = getDevotionalSections(content, verse, title);
  const alapige = sections.find((s) => s.id === "alapige");
  const bodySections = sections.filter((s) => s.id !== "alapige");
  const showCredit = hasAssignedDevotionalImage(imageUrl);

  return (
    <div className="devotional-article w-full">
      {showHeader && (
        <header className="text-center mb-8 md:mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-gold-600 mb-4">
            {dayNumber}. nap
            {category ? ` · ${category}` : ""}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-[2.75rem] font-semibold text-ink leading-tight tracking-tight">
            {title}
          </h1>
        </header>
      )}

      {alapige && (
        <div className="devotional-article-alapige mb-6 md:mb-8">
          <DevotionalSectionCard section={alapige} />
        </div>
      )}

      <figure className="devotional-article-figure w-full mb-8 md:mb-10 m-0">
        <div className="devotional-article-image-frame devotional-article-image">
          <DevotionalIllustration
            imageUrl={imageUrl}
            alt={title}
            fill
            className="object-cover"
            priority={priorityImage}
            sizes="(max-width: 840px) 100vw, 840px"
            allowFallback
          />
        </div>
        <figcaption className="devotional-article-caption">
          <span className="devotional-article-caption-day">{dayNumber}. nap</span>
          {showCredit && (
            <ImageCredit devotional={{ ...imageMeta, imageUrl }} className="sm:text-right" />
          )}
        </figcaption>
      </figure>

      {bodySections.length > 0 ? (
        <div className="devotional-article-body space-y-5 md:space-y-6">
          {bodySections.map((section) => (
            <DevotionalSectionCard
              key={`${section.id}-${section.title}`}
              section={section}
            />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="devotional-article-body devotional-body">
          <p className="text-ink-muted font-serif">Nincs megjeleníthető tartalom.</p>
        </div>
      ) : null}
    </div>
  );
}
