/**
 * Vercel Hobby keret-ellenőrzés: az alkalmazásréteg valódi folyamatait (generálás
 * tárolási lépései, admin munkamenet, közzététel, képfeltöltés, nyilvános olvasás,
 * retry, napi retention) memóriabeli Blobbal MÉRJÜK, majd a havi használatot
 * kivetítjük. A számlálás konzervatív: minden olvasás egyszerű műveletnek számít
 * (a valóságban a CDN-találatok nem), az írás pedig összetettnek.
 *
 * Hobby keret (Vercel Blob): 10 000 egyszerű és 2 000 összetett művelet / hó.
 * A cél: a becsült használat a keret felét sem éri el.
 *
 * A részletes táblázatért: BUDGET_REPORT=1 npm test -- tests/blob-budget.test.ts
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getAppTodayIso } from "../src/lib/app-date";
import { uploadDevotionalImage } from "../src/lib/devotional-image-upload";
import {
  appendDevotional,
  getDevotionalByDay,
  getPublicWindowDevotionals,
  PUBLIC_CACHE_REVALIDATE_SECONDS,
  readDevotionals,
  readStoredMeta,
  saveDevotionalAdminEdit,
  saveDevotionalPexelsImage,
  updateDevotionalStatus,
} from "../src/lib/devotionals";
import { getGenerationJob, saveGenerationJob } from "../src/lib/generation-job-storage";
import { createEmptyGenerationJob } from "../src/lib/generation-job-types";
import { MemoryImageStore } from "../src/lib/storage/blob/image-store";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import {
  getDevotionalStorage,
  setBlobClientForTesting,
  setImageStoreForTesting,
} from "../src/lib/storage";
import type { Devotional } from "../src/lib/types";

const HOBBY = { simple: 10_000, advanced: 2_000, transferGb: 10 };

const today = getAppTodayIso();
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Valósághű méret: ~3 KB szöveg + ima + Facebook-szöveg + 2 korábbi változat. */
function devotional(dayNumber: number, date: string, overrides: Partial<Devotional> = {}): Devotional {
  const body = `## Elmélkedés\n\n${"Szöveg ".repeat(450)}`;
  return {
    dayNumber,
    date,
    title: `Cím ${dayNumber}`,
    verse: `Róma ${dayNumber}:1 — teszt vers`,
    content: body,
    prayer: "Ima ".repeat(60),
    facebookCopy: "Facebook szöveg ".repeat(40),
    imageUrl: "https://images.pexels.com/photos/1/a.jpeg",
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
    ...overrides,
  };
}

const client = new MemoryBlobClient();
const images = new MemoryImageStore();

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, ...new Array(2000).fill(7)]);

interface Cost {
  simple: number;
  advanced: number;
}

async function measure(run: () => Promise<unknown>): Promise<Cost> {
  client.resetOps();
  await run();
  return { simple: client.ops.simple, advanced: client.ops.advanced };
}

before(async () => {
  setBlobClientForTesting(client);
  setImageStoreForTesting(images);

  // Állandósult állapot: a mai nap + az előző 8 nap (a legrégebbi lejárt) már közzétéve.
  for (let i = 8; i >= 1; i--) {
    await appendDevotional(devotional(100 - i, addDays(today, -i)));
  }
  client.resetOps();
});
after(() => {
  setBlobClientForTesting(null);
  setImageStoreForTesting(null);
});

test("Hobby keret: a mért folyamatok havi kivetítése a keret felénél kevesebb", async () => {
  const storage = getDevotionalStorage();
  const jobDate = today;

  // F1: sikeres napi generálás tárolási lépései (a Gemini-hívás nélkül).
  const generation = await measure(async () => {
    await getGenerationJob(jobDate); // a cron / retry feldolgozó feladat-olvasása
    await readDevotionals(); // ensureDevotionalNotAlreadyPublished
    await saveGenerationJob({ ...createEmptyGenerationJob(jobDate), status: "running" });
    await readDevotionals(); // generate: előzmény
    await readStoredMeta(); // memória a törölt napokból
    await appendDevotional(devotional(200, today, { imageUrl: "" })); // mentés
    await saveDevotionalPexelsImage(200, {
      imageUrl: "https://images.pexels.com/photos/2/b.jpeg",
      imageCredit: "Fotós",
      imagePhotographerUrl: "https://www.pexels.com/@f",
    });
    await saveGenerationJob({ ...createEmptyGenerationJob(jobDate), status: "published" });
  });

  // F2: sikertelen kísérlet + újrapróba rögzítése.
  const failedAttempt = await measure(async () => {
    await getGenerationJob(jobDate);
    await readDevotionals();
    await saveGenerationJob({ ...createEmptyGenerationJob(jobDate), status: "running" });
    await saveGenerationJob({ ...createEmptyGenerationJob(jobDate), status: "pending_retry" });
  });

  // F3: egy admin munkamenet: betöltés ×2, két nap megnyitása, szerkesztés, visszavonás + újraközzététel, képfeltöltés.
  const { loadAdminPageData } = await import("../src/lib/app-data");
  const adminSession = await measure(async () => {
    await loadAdminPageData();
    await loadAdminPageData();
    await getDevotionalByDay(95);
    await getDevotionalByDay(96);
    await saveDevotionalAdminEdit(200, { title: "Szerkesztett cím" });
    await updateDevotionalStatus(200, "draft");
    await updateDevotionalStatus(200, "published");
    await uploadDevotionalImage({ dayNumber: 200, bytes: JPEG });
  });

  // F4: egy nyilvános gyorsítótár-frissítés (a Next-cache 10 percenként legfeljebb egyszer olvas).
  const publicRefresh = await measure(() => getPublicWindowDevotionals());

  // F5: egy retry-feldolgozó hívás, ha nincs függő feladat.
  const retryCall = await measure(() => getGenerationJob(addDays(today, -1)));

  // F6: napi retention (egy lejárt nap törlése).
  const retention = await measure(async () => {
    assert.ok(storage.runRetention);
    const result = await storage.runRetention({ apply: true });
    assert.equal(result.deleted, true);
  });

  // --- Havi kivetítés (30 nap) ---
  const days = 30;
  const failedDays = 3; // a hónapban ennyi nap igényel újrapróbát
  const adminSessions = 20; // a hónapban ennyi napon használod az admint
  // Legrosszabb eset: óránként lejár a cache + minden írás (kb. napi 12) után új olvasás.
  const publicRefreshesPerDay = Math.ceil(86_400 / PUBLIC_CACHE_REVALIDATE_SECONDS) + 12;

  const monthly = {
    simple:
      days * generation.simple +
      failedDays * failedAttempt.simple +
      adminSessions * adminSession.simple +
      days * publicRefreshesPerDay * publicRefresh.simple +
      days * 3 * retryCall.simple +
      days * retention.simple,
    advanced:
      days * generation.advanced +
      failedDays * failedAttempt.advanced +
      adminSessions * adminSession.advanced +
      days * publicRefreshesPerDay * publicRefresh.advanced +
      days * 3 * retryCall.advanced +
      days * retention.advanced,
  };

  if (process.env.BUDGET_REPORT) {
    const row = (name: string, c: Cost) =>
      console.log(`  ${name.padEnd(34)} egyszerű ${String(c.simple).padStart(3)}   összetett ${String(c.advanced).padStart(3)}`);
    console.log("\nMért műveletek folyamatonként:");
    row("F1 sikeres napi generálás", generation);
    row("F2 sikertelen kísérlet + retry", failedAttempt);
    row("F3 admin munkamenet", adminSession);
    row("F4 nyilvános cache-frissítés", publicRefresh);
    row("F5 retry-hívás (nincs feladat)", retryCall);
    row("F6 napi retention", retention);
    console.log("\nHavi kivetítés (30 nap, konzervatív):");
    console.log(`  egyszerű:  ${monthly.simple} / ${HOBBY.simple}  (${((monthly.simple / HOBBY.simple) * 100).toFixed(0)}%)`);
    console.log(`  összetett: ${monthly.advanced} / ${HOBBY.advanced}  (${((monthly.advanced / HOBBY.advanced) * 100).toFixed(0)}%)`);
  }

  assert.ok(monthly.advanced <= HOBBY.advanced * 0.5, `összetett: ${monthly.advanced}/${HOBBY.advanced}`);
  assert.ok(monthly.simple <= HOBBY.simple * 0.5, `egyszerű: ${monthly.simple}/${HOBBY.simple}`);

  // Szerkezeti garanciák: nyilvános olvasás nem ír, a retention nem listáz.
  assert.equal(publicRefresh.advanced, 0);
  assert.equal(publicRefresh.simple, 1);
});

test("Hobby adatforgalom: a nyilvános pillanatkép mérete és a havi forgalom a 10 GB töredéke", async () => {
  const snapshot = client.peek("public-window.json") ?? "";
  const bytes = new TextEncoder().encode(snapshot).length;

  const refreshesPerMonth = 30 * (Math.ceil(86_400 / PUBLIC_CACHE_REVALIDATE_SECONDS) + 12); // legrosszabb eset
  const gb = (bytes * refreshesPerMonth) / 1024 ** 3;

  if (process.env.BUDGET_REPORT) {
    console.log(`\nPillanatkép: ${(bytes / 1024).toFixed(1)} KB; havi forgalom (legrosszabb eset): ${(gb * 1024).toFixed(0)} MB`);
  }
  assert.ok(bytes < 200 * 1024, `a pillanatkép túl nagy: ${bytes} bájt`);
  assert.ok(gb < HOBBY.transferGb * 0.1, `havi forgalom: ${gb.toFixed(2)} GB`);
});
