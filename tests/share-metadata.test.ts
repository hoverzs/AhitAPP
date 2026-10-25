process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";

import assert from "node:assert/strict";
import test from "node:test";
import { getAppTodayIso } from "../src/lib/app-date";
import { setBlobClientForTesting } from "../src/lib/storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import type { Devotional } from "../src/lib/types";

function devotional(date: string, imageUrl: string): Devotional {
  return {
    date,
    title: "Teszt áhítat",
    verse: "Zsoltárok 23:1 — Az Úr az én pásztorom",
    content: "### Alapige\n> x\n\nSzöveg.",
    imageUrl,
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
  };
}

async function metadataFor(imageUrl: string) {
  setBlobClientForTesting(new MemoryBlobClient());
  const date = getAppTodayIso();
  const { appendDevotional } = await import("../src/lib/devotionals");
  await appendDevotional(devotional(date, imageUrl));
  const { generateMetadata } = await import("../src/app/devotional/[date]/page");
  const meta = await generateMetadata({ params: Promise.resolve({ date }) } as never);
  return { meta, date };
}

test("megosztási metaadat: og:url, og:type, twitter:card és kanonikus URL", async () => {
  const { meta, date } = await metadataFor("https://x.public.blob.vercel-storage.com/images/a.jpg");
  const og = meta.openGraph as { url?: string; type?: string; images?: { url: string }[] };
  assert.equal(og.url, `https://ahitapp.example/devotional/${date}`);
  assert.equal(og.type, "article");
  assert.equal(og.images?.[0].url, "https://x.public.blob.vercel-storage.com/images/a.jpg");
  assert.equal((meta.twitter as { card?: string }).card, "summary_large_image");
  assert.equal(meta.alternates?.canonical, `https://ahitapp.example/devotional/${date}`);
});

test("megosztási metaadat: a tartalék kép abszolút URL-lel szerepel", async () => {
  const { meta } = await metadataFor("");
  const og = meta.openGraph as { images?: { url: string }[] };
  assert.equal(og.images?.[0].url, "https://ahitapp.example/images/devotional-fallback.jpg");
});
