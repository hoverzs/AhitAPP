/** Kliens-biztos hibacímke — ne importáljon szerver Gemini modulokat. */
export type GeminiErrorCode =
  | "TLS_CERTIFICATE"
  | "NETWORK"
  | "API_KEY"
  | "API_HTTP"
  | "GEMINI_OVERLOAD"
  | "DUPLICATE_VERSE"
  | "SAFETY"
  | "EMPTY_RESPONSE"
  | "MAX_TOKENS"
  | "UNKNOWN";

export function getGeminiErrorTitle(code: GeminiErrorCode | string | undefined): string {
  switch (code) {
    case "GEMINI_OVERLOAD":
      return "Gemini átmenetileg túlterhelt";
    case "DUPLICATE_VERSE":
      return "Ismétlődő igehely";
    case "NETWORK":
    case "TLS_CERTIFICATE":
    case "API_KEY":
    case "API_HTTP":
      return "API kapcsolat sikertelen";
    case "EMPTY_RESPONSE":
      return "API válasz üres";
    case "MAX_TOKENS":
      return "Levágott válasz (token limit)";
    case "SAFETY":
      return "Biztonsági szűrő miatt blokkolt";
    default:
      return "Válaszfeldolgozási hiba";
  }
}
