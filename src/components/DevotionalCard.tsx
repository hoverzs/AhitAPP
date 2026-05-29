import Link from "next/link";
import type { Devotional } from "@/lib/types";
import { DevotionalIllustration } from "@/components/DevotionalIllustration";
import { stripMarkdownForPreview } from "@/lib/devotional-sections";

interface DevotionalCardProps {
  devotional: Devotional;
}

export function DevotionalCard({ devotional }: DevotionalCardProps) {
  const excerpt = stripMarkdownForPreview(devotional.content, 120);

  return (
    <Link
      href={`/nap/${devotional.dayNumber}`}
      className="group block rounded-2xl border border-parchment-200 bg-white p-6 shadow-soft transition-all hover:shadow-card hover:border-gold-400/30"
    >
      <div className="flex gap-5">
        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl">
          <DevotionalIllustration
            imageUrl={devotional.imageUrl}
            alt={devotional.title}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="96px"
            allowFallback
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gold-600">
            {devotional.dayNumber}. nap
          </p>
          <h2 className="font-serif text-xl font-semibold text-slate-800 group-hover:text-gold-600 transition-colors mt-1">
            {devotional.title}
          </h2>
          <p className="mt-2 text-sm text-slate-500 line-clamp-2 italic">
            „{devotional.verse.slice(0, 80)}
            {devotional.verse.length > 80 ? "…" : ""}”
          </p>
          <p className="mt-2 text-sm text-slate-600 line-clamp-2">{excerpt}…</p>
        </div>
      </div>
    </Link>
  );
}
