import { notFound } from "next/navigation";
import { DevotionalArticleLayout } from "@/components/devotional/DevotionalArticleLayout";
import { DevotionalShareButtons } from "@/components/devotional/DevotionalShareButtons";
import { DevotionalUnavailable } from "@/components/devotional/DevotionalUnavailable";
import type { Metadata } from "next";
import { getPublicWindowDevotionals } from "@/lib/devotionals";
import { getPublicDevotionalUrl } from "@/lib/facebook";
import { resolveDevotionalDisplayImage } from "@/lib/image-assets";
import type { Devotional } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

type DayLookup =
  | { kind: "ok"; devotional: Devotional }
  | { kind: "expired" }
  | { kind: "missing" }
  | { kind: "error" };

/**
 * Napszám szerinti keresés a nyilvános 8 napos ablakban (ugyanaz a cache-elt
 * lista, mint a főoldalé). A Facebook-linkek /nap/<napszám> alakúak, ezért az
 * ablakból kiesett napszám „lejárt"; a legújabbnál nagyobb „még nincs".
 */
async function lookupByDay(dayNumber: number): Promise<DayLookup> {
  try {
    const window = await getPublicWindowDevotionals();
    const found = window.find((d) => d.dayNumber === dayNumber);
    if (found) return { kind: "ok", devotional: found };
    const newest = window[0]?.dayNumber ?? 0;
    return { kind: dayNumber > newest ? "missing" : "expired" };
  } catch (error) {
    console.error(`[nap/[id]] dayNumber=${dayNumber} → STORAGE ERROR`, error);
    return { kind: "error" };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const dayNumber = Number(id);
  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    return { title: "Nem található" };
  }

  const result = await lookupByDay(dayNumber);
  if (result.kind !== "ok") {
    return { title: "Az áhítat nem érhető el", robots: { index: false } };
  }

  const devotional = result.devotional;
  const displayImage = resolveDevotionalDisplayImage(devotional.imageUrl);

  return {
    title: `${devotional.dayNumber}. nap – ${devotional.title}`,
    description: devotional.verse,
    openGraph: {
      title: devotional.title,
      description: devotional.verse,
      ...(displayImage.src ? { images: [{ url: displayImage.src }] } : {}),
    },
  };
}

export default async function DevotionalPage({ params }: PageProps) {
  const { id } = await params;
  const dayNumber = Number(id);

  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    notFound();
  }

  const result = await lookupByDay(dayNumber);

  if (result.kind !== "ok") {
    return (
      <article className="devotional-day-page mx-auto w-full max-w-[840px] px-5 sm:px-6 py-12 md:py-20">
        <DevotionalUnavailable reason={result.kind} />
      </article>
    );
  }

  const devotional = result.devotional;
  const publicUrl = getPublicDevotionalUrl(dayNumber);

  return (
    <article className="devotional-day-page mx-auto w-full max-w-[840px] px-5 sm:px-6 py-12 md:py-20">
      <DevotionalArticleLayout
        content={devotional.content}
        verse={devotional.verse}
        dayNumber={devotional.dayNumber}
        title={devotional.title}
        category={devotional.category}
        imageUrl={devotional.imageUrl}
        imageMeta={devotional}
        showHeader
        priorityImage
      />

      <DevotionalShareButtons devotional={devotional} publicUrl={publicUrl} />
    </article>
  );
}
