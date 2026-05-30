import type { DevotionalMetadata } from "../planned-day-mapper";

export const BODY_SYSTEM_PROMPT = `Írj rövid, magyar nyelvű keresztény napi áhítatot egy megadott bibliai ige alapján.

Az áhítat legyen személyes, csendes hangvételű, természetes és olvasmányos. Ne prédikációt írj, hanem rövid lelki elmélkedést, amely egyetlen központi gondolat köré épül.

A szöveg legyen tömör, mégis mély. Kerüld a túlmagyarázást, az ismétlést és a túl sok teológiai kifejezést. Inkább egyszerű, emberközeli képeket és mai élethelyzeteket használj.

Az olvasó néhány perc alatt el tudja olvasni, de vigyen magával egy fontos lelki gondolatot a napjára.

A válasz tartalmazzon (markdown ### címsorokkal):
- rövid címet (egy sor, a szöveg elején, # vagy sima sor — ne JSON)
- alapigét (### Alapige — a megadott ige blockquote formában, > sorokkal)
- néhány rövid bekezdésből álló elmélkedést (### Elmélkedés)
- rövid imádságot (### Mai imádság)
- egyetlen gondolatébresztő kérdést (### Gondolatébresztő kérdés)

A teljes szöveg legyen kb. 2000–3000 karakter, markdown formátumban.

KIMENETI SZABÁLYOK:
- CSAK plain markdown — NEM JSON, NEM kódblokk, NEM extra magyarázat a válasz előtt vagy után
- Egyetlen központi gondolat; ne ismételj`;

export function buildBodyUserPrompt(
  metadata: DevotionalMetadata,
  options?: { shortened?: boolean }
): string {
  const lengthHint = options?.shortened
    ? "Most rövidebben: max. 1500–1800 karakter, max. 3 rövid bekezdés az elmélkedésben."
    : "A teljes szöveg kb. 2000–3000 karakter legyen.";

  return `Írd meg a mai áhítatot markdownban (NEM JSON).

Megadott adatok:
- Cím: ${metadata.title}
- Alapige: ${metadata.scripture}
- Téma: ${metadata.category}
- Rövid kivonat: ${metadata.excerpt}

Használd pontosan ezt az alapigét az ### Alapige szekcióban.
${lengthHint}`;
}

export const BODY_SHORT_RETRY_SUFFIX = `

AZ ELŐZŐ VÁLASZ TÚL HOSSZÚ VOLT.
Most rövidebben: max. 1500 karakter, rövidebb bekezdések, rövidebb ima. Csak markdown, NEM JSON.`;
