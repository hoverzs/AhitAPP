interface VerseBlockquoteProps {
  verse: string;
}

export function VerseBlockquote({ verse }: VerseBlockquoteProps) {
  return (
    <blockquote className="relative my-10 rounded-2xl border border-gold-400/25 bg-gradient-to-br from-amber-50/80 to-parchment-100 px-8 py-8 text-center shadow-soft">
      <span
        className="absolute left-6 top-4 font-serif text-5xl text-gold-400/40 leading-none select-none"
        aria-hidden
      >
        „
      </span>
      <p className="font-serif text-xl md:text-2xl text-slate-700 leading-relaxed italic relative z-10">
        {verse}
      </p>
    </blockquote>
  );
}
