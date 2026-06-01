/** Kliens-biztos hibacímke — ne importáljon szerver Gemini modulokat. */
export type GeminiErrorCode =
  | "TLS_CERTIFICATE"
  | "NETWORK"
  | "TIMEOUT"
  | "API_KEY"
  | "AUTH"
  | "QUOTA"
  | "API_HTTP"
  | "GEMINI_OVERLOAD"
  | "METADATA_GENERATION"
  | "DUPLICATE_VERSE"
  | "SAFETY"
  | "EMPTY_RESPONSE"
  | "MAX_TOKENS"
  | "UNKNOWN";

/** Dev mód (GEMINI_DEBUG_UI): részletes technikai mezők az admin UI-ban. */
export interface GeminiErrorDebugInfo {
  httpStatus?: number;
  geminiMessage?: string;
  geminiStatus?: string;
  model?: string;
  durationMs?: number;
  attempt?: number;
  overloadRetry?: number;
  technicalMessage?: string;
  rawBodyPreview?: string;
  kind?: string;
}

export function getGeminiErrorTitle(code: GeminiErrorCode | string | undefined): string {
  switch (code) {
    case "GEMINI_OVERLOAD":
      return "Gemini átmenetileg túlterhelt";
    case "METADATA_GENERATION":
      return "Metadata generálás sikertelen";
    case "DUPLICATE_VERSE":
      return "Ismétlődő igehely";
    case "AUTH":
      return "API kulcs / jogosultság hiba";
    case "QUOTA":
      return "Gemini kvóta túllépve";
    case "TIMEOUT":
      return "Gemini időtúllépés";
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
