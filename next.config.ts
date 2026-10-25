import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oaidalleapiprodscus.blob.core.windows.net",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        // Vercel Blob képtár (nyilvános store) — csak az images/ útvonal.
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/images/**",
      },
    ],
  },
};

export default nextConfig;
