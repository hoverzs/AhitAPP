import { CopyButton } from "@/components/CopyButton";
import {
  formatDevotionalForFacebook,
  formatDevotionalShortForFacebook,
  formatDevotionalForWebsiteEmbed,
} from "@/lib/facebook";
import type { Devotional } from "@/lib/types";

interface DevotionalShareButtonsProps {
  devotional: Devotional;
  publicUrl: string;
}

/** Aznapi elmélkedés alatti megosztás / másolás gombok. */
export function DevotionalShareButtons({
  devotional,
  publicUrl,
}: DevotionalShareButtonsProps) {
  const facebookText = formatDevotionalForFacebook(devotional, publicUrl);
  const facebookShort = devotional.facebookCopy?.trim()
    ? formatDevotionalShortForFacebook(devotional.facebookCopy, publicUrl)
    : null;
  const websiteEmbed = formatDevotionalForWebsiteEmbed(devotional, publicUrl);

  return (
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
        text={websiteEmbed}
        label="📋 Honlapra ajánló másolása"
        successLabel="Honlap ajánló másolva!"
        className="w-full sm:w-auto text-sm"
      />
      <CopyButton
        text={facebookText}
        label="📋 Teljes szöveg másolása"
        successLabel="Szöveg másolva!"
        className="w-full sm:w-auto text-xs"
      />
    </div>
  );
}
