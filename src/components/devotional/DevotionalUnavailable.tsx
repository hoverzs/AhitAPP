import Link from "next/link";

export type DevotionalUnavailableReason =
  | "missing"
  | "unpublished"
  | "incomplete"
  | "error";

const TITLES: Record<DevotionalUnavailableReason, string> = {
  error: "Az áhítat átmenetileg nem érhető el",
  missing: "Erre a napra még nincs áhítat",
  unpublished: "Az áhítat még nincs publikálva",
  incomplete: "Az áhítat hiányos",
};

const MESSAGES: Record<DevotionalUnavailableReason, string> = {
  error: "Nem sikerült betölteni az áhítatot. Kérlek próbáld újra pár perc múlva.",
  missing: "Erre a napra még nincs áhítat generálva.",
  unpublished: "Ez az áhítat még nincs publikálva.",
  incomplete: "Ez az áhítat hiányosan lett elmentve. Kérlek generáld újra.",
};

interface DevotionalUnavailableProps {
  reason: DevotionalUnavailableReason;
}

export function DevotionalUnavailable({ reason }: DevotionalUnavailableProps) {
  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <h1 className="font-serif text-4xl text-slate-800">{TITLES[reason]}</h1>
      <p className="mt-4 text-slate-600">{MESSAGES[reason]}</p>
      <Link
        href="/"
        className="inline-block mt-8 text-gold-600 font-medium hover:underline"
      >
        ← Vissza az archívumhoz
      </Link>
    </div>
  );
}
