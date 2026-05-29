import type { Devotional } from "@/lib/types";
import type { DisplayVerse } from "@/lib/display-verse";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { Button } from "@/components/ui/Button";
import { IconSun } from "@/components/icons";
import { STATIC_EXCERPT } from "@/lib/fallbacks";

interface TodayVerseCardProps {
  devotional: Devotional | null;
  displayVerse: DisplayVerse;
}

function plainExcerpt(content: string, maxLen = 160): string {
  const block =
    content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .find((p) => p.length > 40 && !p.startsWith("🕊")) ?? content;
  const plain = block.replace(/\s+/g, " ").trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
}

export function TodayVerseCard({ devotional, displayVerse }: TodayVerseCardProps) {
  const verseText = devotional
    ? devotional.verse.includes("—")
      ? devotional.verse.split("—").slice(1).join("—").trim()
      : devotional.verse
    : displayVerse.text;

  const reference = devotional
    ? devotional.verse.split("—")[0]?.trim() ?? displayVerse.reference
    : displayVerse.reference;

  const excerpt = devotional ? plainExcerpt(devotional.content) : STATIC_EXCERPT;
  const href = devotional ? `/nap/${devotional.dayNumber}` : "/admin";

  return (
    <DashboardCard
      variant="featured"
      title="Mai ige"
      icon={<IconSun />}
      headerAction={
        <span className="text-xs font-semibold text-gold-600 bg-gold-500/10 border border-gold-500/20 px-3 py-1 rounded-full whitespace-nowrap tracking-wide">
          {reference}
        </span>
      }
      className="relative overflow-hidden"
    >
      <div
        className="pointer-events-none absolute -right-8 -top-6 font-serif text-[7rem] leading-none text-gold-500/10 select-none"
        aria-hidden
      >
        „
      </div>

      <blockquote className="flex-1 relative z-[1]">
        <p className="font-serif text-2xl md:text-[1.75rem] lg:text-3xl text-ink leading-[1.45] italic font-medium tracking-tight">
          „{verseText.length > 140 ? `${verseText.slice(0, 140)}…` : verseText}”
        </p>
      </blockquote>

      <p className="mt-5 text-sm text-ink-muted leading-relaxed line-clamp-4 relative z-[1]">
        {excerpt}
      </p>

      <Button href={href} className="mt-7 w-full relative z-[1]">
        {devotional ? "Elolvasom a mai áhítatot" : "Első áhítat generálása"}
      </Button>
    </DashboardCard>
  );
}
