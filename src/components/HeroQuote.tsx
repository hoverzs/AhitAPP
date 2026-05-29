interface HeroQuoteProps {
  variant?: "card" | "hero" | "mobile";
}

function QuoteLines({ highlightClassName }: { highlightClassName: string }) {
  return (
    <>
      <span className="hero-quote-line">Lehet az út tövises, meredek,</span>
      <span className="hero-quote-line">amerre vezetsz, bátran mehetek.</span>
      <span className="hero-quote-line">S mindennapi kérésem az marad:</span>
      <span className={highlightClassName}>
        „Add, hogy csupán Téged kívánjalak!”
      </span>
    </>
  );
}

function QuoteCitation({ className = "" }: { className?: string }) {
  return (
    <footer className={className}>
      — Túrmezei Erzsébet: <cite className="not-italic">A legnehezebb kérés</cite>
    </footer>
  );
}

export function HeroQuote({ variant = "card" }: HeroQuoteProps) {
  if (variant === "mobile") {
    return (
      <blockquote className="hero-quote-mobile">
        <p className="hero-quote-mobile-body">
          <QuoteLines highlightClassName="hero-quote-mobile-highlight" />
        </p>
        <QuoteCitation className="hero-quote-mobile-cite" />
      </blockquote>
    );
  }

  if (variant === "hero") {
    return (
      <blockquote className="hero-quote max-w-xl text-left relative">
        <span className="hero-quote-mark" aria-hidden>
          „
        </span>
        <p className="hero-quote-body">
          <QuoteLines highlightClassName="hero-quote-highlight" />
        </p>
        <QuoteCitation className="hero-quote-cite" />
      </blockquote>
    );
  }

  return (
    <blockquote className="mx-auto max-w-3xl text-center">
      <p className="font-serif text-xl sm:text-2xl md:text-3xl lg:text-4xl text-ink italic leading-snug md:leading-[1.35] font-medium tracking-tight">
        Lehet az út tövises, meredek,
        <br />
        amerre vezetsz, bátran mehetek.
        <br />
        S mindennapi kérésem az marad:
        <br />
        <span className="text-gold-600 not-italic font-semibold">
          „Add, hogy csupán Téged kívánjalak!”
        </span>
      </p>
      <footer className="mt-8 md:mt-10 text-sm md:text-base text-ink-muted font-sans not-italic">
        — Túrmezei Erzsébet: <cite className="not-italic">A legnehezebb kérés</cite>
      </footer>
    </blockquote>
  );
}
