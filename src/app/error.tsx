"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <p className="text-xs uppercase tracking-widest text-gold-600 mb-3">Hiba</p>
      <h1 className="font-serif text-3xl text-slate-800">Valami nem sikerült</h1>
      <p className="mt-4 text-slate-600 text-sm leading-relaxed">
        Próbáld újraindítani az oldalt. Ha a hiba marad, állítsd le a dev szervert,
        töröld a <code className="text-gold-700">.next</code> mappát, majd futtasd újra:{" "}
        <code className="text-gold-700">npm run dev</code>
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-gold-500 px-6 py-3 text-white font-medium hover:bg-gold-600"
        >
          Újrapróbálás
        </button>
        <Link
          href="/"
          className="rounded-full border border-parchment-200 px-6 py-3 text-slate-700 font-medium hover:border-gold-400"
        >
          Kezdőlap
        </Link>
      </div>
    </div>
  );
}
