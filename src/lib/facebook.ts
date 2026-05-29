import type { Devotional } from "./types";

/** A content mező plain szöveg / egyszerű Markdown — linkkel kiegészítve megosztható. */
export function formatDevotionalForFacebook(
  devotional: Devotional,
  publicUrl: string
): string {
  const body =
    devotional.facebookCopy?.trim() ||
    devotional.content.replace(/^#+\s+/gm, "").trim().slice(0, 900);

  return [
    body,
    "",
    `👉 Olvasd el itt: ${publicUrl}`,
    "",
    "#áhítat #napiige #hit",
  ].join("\n");
}

export function getPublicDevotionalUrl(dayNumber: number, baseUrl?: string): string {
  const origin =
    baseUrl ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/nap/${dayNumber}`;
}
