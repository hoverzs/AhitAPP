import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteHeaderWrapper } from "@/components/SiteHeaderWrapper";
import { SiteFooter } from "@/components/SiteFooter";
import { APP_NAME } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: "Napi keresztény áhítatos sorozat — csendes elmélkedés minden napra.",
  openGraph: { siteName: APP_NAME, type: "website", locale: "hu_HU" },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body className="min-h-screen flex flex-col overflow-x-hidden">
        <SiteHeaderWrapper />
        <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
