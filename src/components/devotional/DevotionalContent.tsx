import {
  parseDevotionalSections,
  type DevotionalSection,
  type DevotionalSectionId,
} from "@/lib/devotional-sections";
import { DevotionalMarkdown } from "./DevotionalMarkdown";
import { DevotionalSectionIcon } from "./DevotionalSectionIcon";
import { ScriptureDisplay } from "./ScriptureDisplay";

interface DevotionalContentProps {
  content: string;
  verse?: string;
  title?: string;
}

export function getDevotionalSections(content: string, verse?: string, title?: string) {
  return parseDevotionalSections(content, {
    verse,
    scripture: verse,
    prependVerseAsAlapige: Boolean(verse?.trim()),
    title,
  });
}

function sectionCardModifier(id: DevotionalSectionId): string {
  switch (id) {
    case "alapige":
      return "devotional-section-card--alapige";
    case "elmélkedes":
      return "devotional-section-card--meditation";
    case "imadsag":
      return "devotional-section-card--prayer";
    case "kerdes":
      return "devotional-section-card--question";
    case "parhuzam":
    case "kifejtes":
      return "devotional-section-card--meditation";
    default:
      return "devotional-section-card--default";
  }
}

export function DevotionalSectionCard({ section }: { section: DevotionalSection }) {
  return (
    <section
      className={`devotional-section-card ${sectionCardModifier(section.id)}`}
    >
      <header className="devotional-section-card__header">
        <DevotionalSectionIcon sectionId={section.id} />
        <h2 className="devotional-section-card__title">{section.title}</h2>
      </header>
      {section.id === "alapige" ? (
        <ScriptureDisplay source={section.body} />
      ) : (
        <DevotionalMarkdown source={section.body} sectionId={section.id} />
      )}
    </section>
  );
}

/** Admin / egyszerű stack — minden szekció egymás alatt. */
export function DevotionalContent({ content, verse, title }: DevotionalContentProps) {
  const sections = getDevotionalSections(content, verse, title);

  if (sections.length === 0) {
    return (
      <div className="devotional-body">
        <DevotionalMarkdown source={content} />
      </div>
    );
  }

  return (
    <div className="devotional-body space-y-5 md:space-y-7">
      {sections.map((section) => (
        <DevotionalSectionCard key={`${section.id}-${section.title}`} section={section} />
      ))}
    </div>
  );
}
