import { notFound } from "next/navigation";
import { DevotionalArticleLayout } from "@/components/devotional/DevotionalArticleLayout";
import { DevotionalShareButtons } from "@/components/devotional/DevotionalShareButtons";
import { isPublicDevotional } from "@/lib/devotional-status";
import { getDevotionalByDate } from "@/lib/devotionals";
import { getPublicDevotionalUrl } from "@/lib/facebook";
import { resolveDevotionalDisplayImage } from "@/lib/image-assets";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface PageProps {
  params: Promise<{ date: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) {
    return { title: "Nem található" };
  }

  const devotional = await getDevotionalByDate(date);
  if (!devotional || !isPublicDevotional(devotional)) {
    return { title: "Nem található" };
  }

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

export default async function DevotionalByDatePage({ params }: PageProps) {
  const { date } = await params;

  if (!DATE_RE.test(date)) {
    notFound();
  }

  const devotional = await getDevotionalByDate(date);
  if (!devotional) {
    notFound();
  }

  if (!isPublicDevotional(devotional)) {
    notFound();
  }

  const publicUrl = getPublicDevotionalUrl(devotional.dayNumber);

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
