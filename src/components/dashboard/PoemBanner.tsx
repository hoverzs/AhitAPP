import { HeroQuote } from "@/components/HeroQuote";

export function PoemBanner() {
  return (
    <section className="mb-8 md:mb-10 rounded-2xl border border-parchment-200/80 bg-gradient-to-br from-white via-parchment-50 to-amber-50/30 px-6 py-10 md:py-12 shadow-soft">
      <HeroQuote />
    </section>
  );
}
