"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="hu">
      <body className="min-h-screen flex items-center justify-center bg-parchment-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-2xl text-slate-800">Alkalmazáshiba</h1>
          <p className="mt-3 text-sm text-slate-600">
            {error.message || "Ismeretlen hiba történt."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-gold-500 px-6 py-2 text-white font-medium"
          >
            Újrapróbálás
          </button>
        </div>
      </body>
    </html>
  );
}
