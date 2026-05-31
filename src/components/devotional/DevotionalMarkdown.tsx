import type { ReactNode } from "react";
import type { DevotionalSectionId } from "@/lib/devotional-sections";
import { prepareDevotionalMarkdownForRender } from "@/lib/prepare-devotional-markdown";
import Markdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

interface DevotionalMarkdownProps {
  source: string;
  className?: string;
  /** Szekció-specifikus finomhangolás */
  sectionId?: DevotionalSectionId;
}

/** Csak olvasmányos elemek — nincs nyers HTML, link, kép. */
const devotionalSanitizeSchema = {
  ...defaultSchema,
  tagNames: ["p", "strong", "em", "blockquote", "ul", "ol", "li", "br"],
  attributes: {},
};

const markdownComponents = {
  h1: () => null,
  h2: () => null,
  h3: () => null,
  h4: () => null,
  h5: () => null,
  h6: () => null,
  a: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  img: () => null,
  code: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  pre: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  p: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong>{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em>{children}</em>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="devotional-blockquote my-5">{children}</blockquote>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-5 list-none pl-0 space-y-3 text-ink/90 font-serif leading-[1.8]">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-5 list-none pl-0 space-y-3 text-ink/90 font-serif leading-[1.8] counter-reset-none">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="pl-0 before:content-none">{children}</li>
  ),
};

/** Áhítat szekció törzs — **félkövér**, *dőlt*, > idézet (biztonságos markdown). */
export function DevotionalMarkdown({
  source,
  className = "",
  sectionId,
}: DevotionalMarkdownProps) {
  const prepared = prepareDevotionalMarkdownForRender(source);
  if (!prepared) return null;

  const sectionClass =
    sectionId === "imadsag"
      ? "devotional-markdown--prayer"
      : sectionId === "kerdes"
        ? "devotional-markdown--question"
        : sectionId === "alapige"
          ? "devotional-markdown--scripture"
          : "";

  return (
    <div className={`devotional-markdown ${sectionClass} ${className}`.trim()}>
      <Markdown
        remarkPlugins={[]}
        rehypePlugins={[[rehypeSanitize, devotionalSanitizeSchema]]}
        components={markdownComponents}
      >
        {prepared}
      </Markdown>
    </div>
  );
}
