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

FORMÁZÁS (visszafogott markdown — az olvasó oldalon renderelődik):
- Az elmélkedésben, imában és kérdésben használj rövid bekezdéseket (üres sorral elválasztva).
- Legfeljebb 2–3 kulcsmondatot emelj ki **félkövérrel** az egész áhítatban (ne többet).
- Legfeljebb egy rövid, imaszerű vagy belső reflexív mondat lehet *dőlt*.
- Ha idézel vagy belső gondolatot hangsúlyozol, használhatsz > blockquote sort (max. 1 rövid idézet).
- Ne használj felsorolást (-, *, számozott lista), ne írj prédikációt.
- Ne használj HTML-t, kódblokkot, táblázatot, linkeket.
- A ** és * jelek mindig párosítsd — ne maradjon nyers markdown jel a szövegben.

A teljes szöveg legyen kb. 2000–3000 karakter, markdown formátumban.

KIMENETI SZABÁLYOK:
- CSAK plain markdown — NEM JSON, NEM kódblokk, NEM extra magyarázat a válasz előtt vagy után
- Egyetlen központi gondolat; ne ismételj`;

export function buildBodyUserPrompt(
  metadata: DevotionalMetadata,
  options?: { shortened?: boolean }
): string {
  const lengthHint = options?.shortened
    ? "Írj rövidebb, lezárt, 3 bekezdéses elmélkedést. Minden mondat legyen befejezett. Max. 1500–1800 karakter összesen."
    : "A teljes szöveg kb. 2000–3000 karakter legyen. Minden mondat és bekezdés legyen lezárt.";

  return `Írd meg a mai áhítatot markdownban (NEM JSON).

Megadott adatok:
- Cím: ${metadata.title}
- Alapige: ${metadata.scripture}
- Téma: ${metadata.category}
- Rövid kivonat: ${metadata.excerpt}

Használd pontosan ezt az alapigét az ### Alapige szekcióban (blockquote > formában).
Az elmélkedésben max. 2–3 **félkövér** kiemelés és legfeljebb 1 *dőlt* mondat legyen.
${lengthHint}`;
}

export const BODY_SHORT_RETRY_SUFFIX = `

AZ ELŐZŐ VÁLASZ NEM VOLT TELJES VAGY TÚL HOSSZÚ VOLT.
Írj rövidebb, lezárt, 3 bekezdéses elmélkedést. Minden mondat legyen befejezett.
Max. 1500–1800 karakter összesen. Rövid ima és egy kérdés is kell. Csak plain markdown, NEM JSON.`;
