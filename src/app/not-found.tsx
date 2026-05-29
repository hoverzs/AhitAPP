import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <h1 className="font-serif text-4xl text-slate-800">Nem található</h1>
      <p className="mt-4 text-slate-600">Ez az áhítat még nem érhető el.</p>
      <Link
        href="/"
        className="inline-block mt-8 text-gold-600 font-medium hover:underline"
      >
        ← Vissza az archívumhoz
      </Link>
    </div>
  );
}
