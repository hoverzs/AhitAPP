import { notFound } from "next/navigation";
import { DevotionalIllustration } from "@/components/DevotionalIllustration";
import { ImageCredit } from "@/components/ImageCredit";
import { DevotionalContent } from "@/components/devotional/DevotionalContent";
import { hasAssignedDevotionalImage, resolveDevotionalDisplayImage } from "@/lib/image-assets";
import { isPublicDevotional } from "@/lib/devotional-status";
import type { Metadata } from "next";
import { getDevotionalByDay } from "@/lib/devotionals";
import { CopyButton } from "@/components/CopyButton";
import { formatDevotionalForFacebook, getPublicDevotionalUrl } from "@/lib/facebook";

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
  const facebookText = formatDevotionalForFacebook(devotional, publicUrl);
  const facebookShort = devotional.facebookCopy?.trim();

  return (
    <article className="mx-auto w-full max-w-[760px] px-5 sm:px-6 py-12 md:py-20">
      <header className="text-center mb-10 md:mb-12">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gold-600 mb-4">
          {devotional.dayNumber}. nap
          {devotional.category ? ` · ${devotional.category}` : ""}
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl md:text-[2.75rem] font-semibold text-ink leading-tight tracking-tight">
          {devotional.title}
        </h1>
      </header>

      <figure className="mb-10 md:mb-12">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl shadow-card bg-parchment-100">
          <DevotionalIllustration
            imageUrl={devotional.imageUrl}
            alt={devotional.title}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 760px) 100vw, 760px"
            allowFallback
          />
        </div>
        {hasAssignedDevotionalImage(devotional.imageUrl) && (
          <ImageCredit devotional={devotional} className="mt-2 text-center" />
        )}
      </figure>

      <DevotionalContent content={devotional.content} verse={devotional.verse} />

      <div className="mt-14 md:mt-16 pt-10 border-t border-ivory-200 flex flex-col items-stretch sm:items-center gap-4 max-w-[760px] mx-auto w-full">
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
