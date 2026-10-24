import Link from "next/link";

export type DevotionalUnavailableReason = "missing" | "expired" | "error";

const TITLES: Record<DevotionalUnavailableReason, string> = {
  expired: "Ez az áhítat már nem érhető el",
  missing: "Erre a napra még nincs áhítat",
  error: "Az áhítat átmenetileg nem érhető el",
};

const MESSAGES: Record<DevotionalUnavailableReason, string> = {
  expired:
    "Az áhítatok csak 8 napig olvashatók: a mai napén és az előző hét napén. A keresett áhítat ennél régebbi, ezért már lejárt.",
  missing: "Erre a napra nincs közzétett áhítat.",
  error: "Nem sikerült betölteni az áhítatot. Kérlek próbáld újra pár perc múlva.",
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
        ← Ugrás a mai áhítathoz
      </Link>
    </div>
  );
}
