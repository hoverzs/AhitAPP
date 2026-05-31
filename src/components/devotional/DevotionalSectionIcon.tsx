import type { DevotionalSectionId } from "@/lib/devotional-sections";

const iconClass = "h-[1.125rem] w-[1.125rem] shrink-0 stroke-[1.35]";

interface IconProps {
  className?: string;
}

function BookIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M12 7v14M5.5 4.5A2.5 2.5 0 0 1 8 2h8a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2V4.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12 3v1.5M12 19.5V21M4.5 12H3M21 12h-1.5M6.4 6.4l-1.1-1.1M18.7 18.7l-1.1-1.1M6.4 17.6l-1.1 1.1M18.7 5.3l-1.1 1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PenIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HandsIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M8 11V8a2 2 0 1 1 4 0v3M12 10V7a2 2 0 1 1 4 0v4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 11c0 3.5 2 6.5 4 6.5s4-3 4-6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 17.5V21" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M12 3l1.2 4.2L17 8.5l-3.8 1.3L12 14l-1.2-4.2L7 8.5l3.8-1.3L12 3z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 16l.6 1.8L20.5 18l-1.9.5L18 20.5l-.6-1.8L15.5 18l1.9-.5L18 16z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LeafIcon({ className = iconClass }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M12 22C8 18 4 13 4 8a8 8 0 0 1 16 0c0 5-4 10-8 14z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 22V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionIconGlyph({ sectionId }: { sectionId: DevotionalSectionId }) {
  switch (sectionId) {
    case "alapige":
      return <BookIcon />;
    case "elmélkedes":
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

function iconToneClass(sectionId: DevotionalSectionId): string {
  switch (sectionId) {
    case "alapige":
      return "alapige";
    case "elmélkedes":
    case "parhuzam":
    case "kifejtes":
      return "meditation";
    case "imadsag":
      return "prayer";
    case "kerdes":
      return "question";
    default:
      return "meditation";
  }
}

/** Prémium ikon-kapszula — arany gradient, finom árnyék. */
export function DevotionalSectionIcon({ sectionId }: { sectionId: DevotionalSectionId }) {
  return (
    <span
      className={`devotional-section-icon devotional-section-icon--${iconToneClass(sectionId)}`}
    >
      <SectionIconGlyph sectionId={sectionId} />
    </span>
  );
}
