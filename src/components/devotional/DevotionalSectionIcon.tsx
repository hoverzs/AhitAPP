import type { DevotionalSectionId } from "@/lib/devotional-sections";

const iconClass = "h-5 w-5 shrink-0 text-gold-600 stroke-[1.5]";

interface IconProps {
  className?: string;
}

function BookIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PenIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HandsIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M7 11V7a2 2 0 0 1 4 0v1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 10V6a2 2 0 0 1 4 0v5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11c0 4 2.5 7 5 7s5-3 5-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M9.5 3.5 11 8l4.5 1.5L11 11l-1.5 4.5L8 11 3.5 9.5 8 8 9.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14l.8 2.4L21 17l-2.2.6L18 20l-.8-2.4L15 17l2.2-.6L18 14z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LeafIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M12 22c-4-3-8-8-8-13a8 8 0 0 1 16 0c0 5-4 10-8 13z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 22V9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DevotionalSectionIcon({ sectionId }: { sectionId: DevotionalSectionId }) {
  switch (sectionId) {
    case "alapige":
      return <BookIcon />;
    case "elmélkedes":
      return <SunIcon />;
    case "parhuzam":
      return <SunIcon />;
    case "kifejtes":
      return <PenIcon />;
    case "imadsag":
      return <HandsIcon />;
    case "kerdes":
      return <SparkIcon />;
    default:
      return <LeafIcon />;
  }
}
