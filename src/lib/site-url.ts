/**
 * Publikus site URL — Facebook megosztás, OG linkek.
 * Élesben mindig NEXT_PUBLIC_SITE_URL (Vercel build / .env.local).
 * Ne használj window.location.origin megosztáshoz.
 */

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/**
 * Kanonikus publikus origin.
 * 1. NEXT_PUBLIC_SITE_URL
 * 2. Dev: localhost:3000 (ha nincs env)
 * 3. Éles Vercel preview/production: VERCEL_URL (szerveroldali fallback)
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return normalizeOrigin(configured);
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    const host = vercelHost.replace(/^https?:\/\//, "");
    return `https://${normalizeOrigin(host)}`;
  }

  console.warn(
    "[site-url] NEXT_PUBLIC_SITE_URL nincs beállítva — a megosztási linkek hibásak lehetnek. Állítsd be Vercel Environment Variables-ben."
  );
  return "http://localhost:3000";
}
