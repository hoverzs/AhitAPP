import type { GeminiErrorCode } from "./gemini-error-labels";

/** Felhasználóbarát üzenetek — nem tartalmaznak nyers HTTP/test body részleteket. */
export function getUserFriendlyGeminiMessage(
  code: GeminiErrorCode,
  fallback?: string
): string {
  switch (code) {
    case "AUTH":
      return "Az API kulcs érvénytelen vagy nincs jogosultság a Gemini API-hoz. Ellenőrizd a GEMINI_API_KEY / GOOGLE_API_KEY beállítást.";
    case "QUOTA":
      return "A Gemini API kvóta túllépve. Próbáld később, vagy ellenőrizd a Google AI Studio limitjeit.";
    case "GEMINI_OVERLOAD":
      return "A Gemini API átmenetileg túlterhelt. A rendszer automatikusan újrapróbálta — várj 1–2 percet, majd próbáld újra.";
    case "TIMEOUT":
      return "A Gemini API nem válaszolt időben. Ellenőrizd a hálózatot, majd próbáld újra.";
    case "NETWORK":
      return "Nem sikerült kapcsolódni a Gemini API-hoz. Ellenőrizd az internetet és a VPN-t.";
    case "TLS_CERTIFICATE":
      return "TLS / tanúsítvány hiba a Gemini API felé. Helyi fejlesztésnél indítsd újra a dev szervert.";
    case "API_KEY":
      return "A Gemini API kulcs nincs beállítva. Add hozzá a .env.local fájlhoz.";
    case "API_HTTP":
      return "A Gemini API HTTP hibát adott. Ellenőrizd a kulcsot és a modell nevét.";
    case "METADATA_GENERATION":
      return fallback ??
        "A Gemini nem tudta előállítani az áhítat metadata részét. Nem használtunk tartalmi fallback igét; nézd meg a szervernaplóban az eredeti Gemini hibát.";
    case "DUPLICATE_VERSE":
      return fallback ??
        "Több már használt igehelyet is elutasítottunk, de most nem sikerült elég gyorsan friss alapigét találni.";
    case "SAFETY":
      return fallback ?? "A modell biztonsági szűrője blokkolta a választ.";
    case "EMPTY_RESPONSE":
      return "A Gemini API válasza üres volt — nem volt olvasható szöveg.";
    case "MAX_TOKENS":
      return "A válasz túl hosszú lett vagy levágódott (token limit).";
    case "UNKNOWN":
    default:
      return fallback ?? "Ismeretlen hiba történt a Gemini API hívás során.";
  }
}
