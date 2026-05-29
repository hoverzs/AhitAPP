import {
  parseDevotionalSections,
  type DevotionalSection,
} from "@/lib/devotional-sections";
import { DevotionalMarkdown } from "./DevotionalMarkdown";
import { DevotionalSectionIcon } from "./DevotionalSectionIcon";

interface DevotionalContentProps {
  content: string;
  verse?: string;
}

function DevotionalSectionCard({ section }: { section: DevotionalSection }) {
  const isAlapige = section.id === "alapige";
  const isKerdes = section.id === "kerdes";

  return (
    <section
      className={`devotional-section-card rounded-2xl border px-6 py-6 md:px-8 md:py-7 ${
        isAlapige
          ? "border-gold-500/25 bg-gradient-to-br from-amber-50/70 via-ivory-50 to-ivory-100/90"
          : isKerdes
            ? "border-ivory-200/90 bg-ivory-50/80"
            : "border-ivory-200/80 bg-[#faf8f4]"
      }`}
    >
      <header className="flex items-center gap-3 mb-5 pb-4 border-b border-ivory-200/80">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 border border-gold-500/15 shadow-sm">
          <DevotionalSectionIcon sectionId={section.id} />
        </span>
        <h2 className="font-serif text-xl md:text-[1.35rem] font-semibold text-ink tracking-tight">
          {section.title}
        </h2>
      </header>
      <DevotionalMarkdown source={section.body} />
    </section>
  );
}

/** Formázott áhítat — markdown szekciók + ikonok */
export function DevotionalContent({ content, verse }: DevotionalContentProps) {
  const sections = parseDevotionalSections(content, {
    verse,
    prependVerseAsAlapige: Boolean(verse?.trim()),
  });

  if (sections.length === 0) {
    return (
      <div className="devotional-body">
        <DevotionalMarkdown source={content} />
      </div>
    );
  }

  return (
    <div className="devotional-body space-y-5 md:space-y-6">
      {sections.map((section) => (
        <DevotionalSectionCard key={`${section.id}-${section.title}`} section={section} />
      ))}
    </div>
  );
}
