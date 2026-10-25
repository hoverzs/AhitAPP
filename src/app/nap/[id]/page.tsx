import Link from "next/link";
import type { Metadata } from "next";

/**
 * Régi, napszám alapú hivatkozások (/nap/<szám>). A napszámozás megszűnt: az
 * áhítatok kizárólag dátum alapján (/devotional/YYYY-MM-DD) érhetők el, és csak
 * a mai nap + az elmúlt 7 nap olvasható. Ez az oldal SOHA nem jelenít meg
 * áhítat-tartalmat, és a tárolóhoz sem nyúl — a régi számok nem használhatók
 * újra, bármilyen számot kapnak, ugyanezt a tájékoztatót látják.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Ez a hivatkozás már nem érvényes",
  robots: { index: false, follow: true },
};

export default function LegacyDayLinkPage() {
  return (
    <article className="devotional-day-page mx-auto w-full max-w-[840px] px-5 sm:px-6 py-12 md:py-20">
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <h1 className="font-serif text-3xl sm:text-4xl text-slate-800">
          Ez a hivatkozás már nem érvényes
        </h1>
        <p className="mt-5 text-slate-600 leading-relaxed">
          Az áhítatok korábban sorszámmal (<span className="whitespace-nowrap">/nap/12</span>) voltak elérhetők.
          Ez a megoldás megszűnt: az áhítatok mostantól dátum szerint nyílnak meg, és
          csak a mai nap, valamint az elmúlt hét nap áhítata olvasható.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/mai"
            className="rounded-full bg-gold-500 px-6 py-3 text-white font-medium hover:bg-gold-600"
          >
            A mai áhítat megnyitása
          </Link>
          <Link
            href="/#elmult-napok"
            className="rounded-full border border-parchment-200 px-6 py-3 text-slate-700 font-medium hover:border-gold-400"
          >
            Az elmúlt napok
          </Link>
        </div>
      </div>
    </article>
  );
}
