import Markdown from "react-markdown";

interface DevotionalMarkdownProps {
  source: string;
  className?: string;
}

/** Áhítat szekció törzs — **félkövér**, *dőlt*, > idézet */
export function DevotionalMarkdown({ source, className = "" }: DevotionalMarkdownProps) {
  const trimmed = source.trim();
  if (!trimmed) return null;

  return (
    <div className={`devotional-markdown ${className}`}>
      <Markdown
        components={{
          h1: () => null,
          h2: () => null,
          h3: () => null,
          h4: () => null,
          p: ({ children }) => (
            <p className="mb-5 last:mb-0 text-[1.0625rem] leading-[1.85] text-ink/90 font-serif">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-ink/85">{children}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="devotional-blockquote">{children}</blockquote>
          ),
          ul: ({ children }) => (
            <ul className="mb-5 list-disc pl-6 space-y-2 text-ink/90 font-serif leading-[1.8]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-5 list-decimal pl-6 space-y-2 text-ink/90 font-serif leading-[1.8]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
        }}
      >
        {trimmed}
      </Markdown>
    </div>
  );
}
