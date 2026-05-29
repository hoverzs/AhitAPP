import type { Devotional } from "@/lib/types";

interface ImageCreditProps {
  devotional: Pick<
    Devotional,
    "imageSource" | "imageCredit" | "imagePhotographerUrl" | "imageUrl"
  >;
  className?: string;
}

/** Pexels attribution — csak hozzárendelt stock kép esetén. */
export function ImageCredit({ devotional, className = "" }: ImageCreditProps) {
  if (
    (devotional.imageSource !== "pexels" && devotional.imageSource !== "pexels_auto") ||
    !devotional.imageCredit?.trim() ||
    !devotional.imageUrl?.trim()
  ) {
    return null;
  }

  return (
    <figcaption className={`text-xs text-ink-muted/75 ${className}`}>
      Fotó:{" "}
      {devotional.imagePhotographerUrl ? (
        <a
          href={devotional.imagePhotographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-gold-600 transition-colors"
        >
          {devotional.imageCredit}
        </a>
      ) : (
        devotional.imageCredit
      )}{" "}
      ·{" "}
      <a
        href="https://www.pexels.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-gold-600 transition-colors"
      >
        Pexels
      </a>
    </figcaption>
  );
}
