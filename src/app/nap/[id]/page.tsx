import { notFound } from "next/navigation";
import { DevotionalArticleLayout } from "@/components/devotional/DevotionalArticleLayout";
import { DevotionalShareButtons } from "@/components/devotional/DevotionalShareButtons";
import { DevotionalUnavailable } from "@/components/devotional/DevotionalUnavailable";
import { normalizeDevotionalStatus } from "@/lib/devotional-status";
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
  let devotional;
  try {
    devotional = await getDevotionalByDay(dayNumber);
  } catch (error) {
    console.error("[nap/[id]] generateMetadata", error);
    return { title: "Áhítat" };
  }

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

  console.log(`[nap/[id]] route param id=${id} dayNumber=${dayNumber}`);

  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    notFound();
  }

  let devotional;
  try {
    devotional = await getDevotionalByDay(dayNumber);
  } catch (error) {
    console.error(`[nap/[id]] dayNumber=${dayNumber} → STORAGE ERROR`, error);
    return (
      <article className="devotional-day-page mx-auto w-full max-w-[840px] px-5 sm:px-6 py-12 md:py-20">
        <DevotionalUnavailable reason="error" />
      </article>
    );
  }

  if (!devotional) {
    console.warn(`[nap/[id]] dayNumber=${dayNumber} → MISSING (nincs rekord)`);
    return (
      <article className="devotional-day-page mx-auto w-full max-w-[840px] px-5 sm:px-6 py-12 md:py-20">
        <DevotionalUnavailable reason="missing" />
      </article>
    );
  }

  const status = normalizeDevotionalStatus(devotional.status);
  const hasContent = Boolean(devotional.content?.trim());

  console.log(
    `[nap/[id]] dayNumber=${dayNumber} status=${status} hasContent=${hasContent} recordDate=${devotional.date ?? "(nincs)"}`
  );

  if (status !== "published") {
    return (
      <article className="devotional-day-page mx-auto w-full max-w-[840px] px-5 sm:px-6 py-12 md:py-20">
        <DevotionalUnavailable reason="unpublished" />
      </article>
    );
  }

  if (!hasContent) {
    return (
      <article className="devotional-day-page mx-auto w-full max-w-[840px] px-5 sm:px-6 py-12 md:py-20">
        <DevotionalUnavailable reason="incomplete" />
      </article>
    );
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
