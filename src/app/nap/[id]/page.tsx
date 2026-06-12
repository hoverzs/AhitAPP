import { notFound } from "next/navigation";
import { DevotionalArticleLayout } from "@/components/devotional/DevotionalArticleLayout";
import { DevotionalShareButtons } from "@/components/devotional/DevotionalShareButtons";
import { isPublicDevotional } from "@/lib/devotional-status";
import type { Metadata } from "next";
import { getDevotionalByDay } from "@/lib/devotionals";
import { getPublicDevotionalUrl } from "@/lib/facebook";
import { resolveDevotionalDisplayImage } from "@/lib/image-assets";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const dayNumber = Number(id);
  const devotional = await getDevotionalByDay(dayNumber);

  if (!devotional) {
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

export default async function DevotionalPage({ params }: PageProps) {
  const { id } = await params;
  const dayNumber = Number(id);

  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    notFound();
  }

  const devotional = await getDevotionalByDay(dayNumber);
  if (!devotional) {
    notFound();
  }

  if (!isPublicDevotional(devotional)) {
    notFound();
  }

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
