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
    <span className={`devotional-image-credit text-[11px] text-ink-muted/80 tracking-wide ${className}`}>
      Fotó:{" "}
      {devotional.imagePhotographerUrl ? (
        <a
          href={devotional.imagePhotographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-muted/90 underline decoration-gold-500/25 underline-offset-[3px] hover:text-gold-600 hover:decoration-gold-500/50 transition-colors"
        >
          {devotional.imageCredit}
        </a>
      ) : (
        <span className="text-ink-muted/90">{devotional.imageCredit}</span>
      )}{" "}
      <span className="text-ink-muted/50" aria-hidden>
        ·
      </span>{" "}
      <a
        href="https://www.pexels.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-muted/75 underline decoration-gold-500/20 underline-offset-[3px] hover:text-gold-600 hover:decoration-gold-500/45 transition-colors"
      >
        Pexels
      </a>
    </span>
  );
}
