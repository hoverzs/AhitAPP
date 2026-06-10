import { parseVerseDisplay } from "@/lib/devotional-excerpt";
import { stripEmbeddedHtml } from "@/lib/strip-embedded-html";

interface ScriptureDisplayProps {
  /** Markdown blockquote vagy sima szöveg (pl. verse mező). */
  source: string;
  className?: string;
}

function plainScriptureText(source: string): string {
  return stripEmbeddedHtml(
    source
      .split("\n")
      .map((line) => line.replace(/^>\s?/, "").trim())
      .filter(Boolean)
      .join(" ")
      .trim()
  );
}

/** Kiemelt alapige — félkövér, rövidebb szöveg nagyobb betűmérettel. */
export function ScriptureDisplay({ source, className = "" }: ScriptureDisplayProps) {
  const plain = plainScriptureText(source);
  if (!plain) return null;

  const { reference, text } = parseVerseDisplay(plain);
  const verseText = text || plain;
  const isShort = verseText.length <= 110;

  return (
    <div className={`devotional-scripture ${className}`.trim()}>
      {reference ? (
        <p className="devotional-scripture-ref">{reference}</p>
      ) : null}
      <p
        className={
          isShort
            ? "devotional-scripture-text devotional-scripture-text--short"
            : "devotional-scripture-text"
        }
      >
        {verseText}
      </p>
    </div>
  );
}
