import { notFound } from "next/navigation";
import { DevotionalArticleLayout } from "@/components/devotional/DevotionalArticleLayout";
import { isPublicDevotional } from "@/lib/devotional-status";
import { getDevotionalByDate } from "@/lib/devotionals";
import { resolveDevotionalDisplayImage } from "@/lib/image-assets";
import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import {
  formatDevotionalForFacebook,
  getPublicDevotionalUrl,
} from "@/lib/facebook";

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
  const facebookText = formatDevotionalForFacebook(devotional, publicUrl);
  const facebookShort = devotional.facebookCopy?.trim();

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

      <div className="mt-14 md:mt-16 pt-10 border-t border-ivory-200 flex flex-col items-stretch sm:items-center gap-4 w-full">
        <CopyButton
          text={publicUrl}
          label="🔗 Link másolása Facebookhoz"
          successLabel="Link másolva!"
          className="w-full sm:w-auto"
        />
        {facebookShort ? (
          <CopyButton
            text={facebookShort}
            label="📋 Rövid Facebook-szöveg másolása"
            successLabel="Rövid szöveg másolva!"
            className="w-full sm:w-auto text-sm"
          />
        ) : null}
        <CopyButton
          text={facebookText}
          label="📋 Teljes szöveg másolása"
          successLabel="Szöveg másolva!"
          className="w-full sm:w-auto text-xs"
        />
      </div>
    </article>
  );
}
