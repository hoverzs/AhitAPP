import { formatGeminiErrorMessage } from "./gemini-client";
import {
  isGeminiApiError,
  isGeminiDebugUiEnabled,
  type GeminiApiError,
  type GeminiApiFailureKind,
} from "./gemini-api-error";
import type { GeminiErrorCode, GeminiErrorDebugInfo } from "./gemini-error-labels";
import { isDuplicateVerseExhaustedError } from "./duplicate-verse-retry";
import {
  getGeminiOverloadExhaustedMessage,
  isGeminiOverloadError,
} from "./gemini-overload-retry";
import {
  GeminiResponseError,
  isGeminiResponseError,
} from "./gemini-response";
import { getGeminiTlsMode, isNodeDevelopment } from "./gemini-tls";
import { getUserFriendlyGeminiMessage } from "./gemini-user-messages";

export type { GeminiErrorCode, GeminiErrorDebugInfo } from "./gemini-error-labels";
export { getGeminiErrorTitle } from "./gemini-error-labels";

export interface GeminiErrorDetails {
  /** Felhasználóbarát üzenet (UI). */
  message: string;
  code: GeminiErrorCode;
  hint?: string;
  tlsMode: ReturnType<typeof getGeminiTlsMode>;
  isDevelopment: boolean;
  finishReason?: string;
  diagnostics?: string;
  /** Csak dev + GEMINI_DEBUG_UI — technikai részletek. */
  debug?: GeminiErrorDebugInfo;
}

function mapApiKindToCode(kind: GeminiApiFailureKind): GeminiErrorCode {
  switch (kind) {
    case "AUTH":
      return "AUTH";
    case "QUOTA":
      return "QUOTA";
    case "OVERLOAD":
      return "GEMINI_OVERLOAD";
    case "NETWORK":
      return "NETWORK";
    case "TIMEOUT":
      return "TIMEOUT";
    case "TLS":
      return "TLS_CERTIFICATE";
    case "HTTP":
    case "JSON_BODY":
      return "API_HTTP";
    default:
      return "UNKNOWN";
  }
}

function mapResponseIssueToCode(
  issue: GeminiResponseError["issue"]
): GeminiErrorCode {
  switch (issue) {
    case "SAFETY":
    case "PROMPT_BLOCKED":
    case "RECITATION":
      return "SAFETY";
    case "MAX_TOKENS":
      return "MAX_TOKENS";
    case "NO_CANDIDATES":
    case "NO_CONTENT":
    case "NO_PARTS":
    case "EMPTY_TEXT":
      return "EMPTY_RESPONSE";
    default:
      return "UNKNOWN";
  }
}

function buildDebugFromApiError(error: GeminiApiError): GeminiErrorDebugInfo {
  return {
    httpStatus: error.httpStatus,
    geminiMessage: error.geminiMessage,
    geminiStatus: error.geminiStatus,
    model: error.model,
    durationMs: error.durationMs,
    attempt: error.attempt,
    overloadRetry: error.overloadRetry,
    technicalMessage: error.message,
    rawBodyPreview: error.rawBody?.slice(0, 2000),
    kind: error.kind,
  };
}

function detectErrorCode(error: unknown, message: string): GeminiErrorCode {
  if (isGeminiApiError(error)) {
    return mapApiKindToCode(error.kind);
  }

  if (isGeminiResponseError(error)) {
    return mapResponseIssueToCode(error.issue);
  }

  if (isDuplicateVerseExhaustedError(error)) {
    return "DUPLICATE_VERSE";
  }

  if (isGeminiOverloadError(error)) {
    return "GEMINI_OVERLOAD";
  }

  const lower = message.toLowerCase();
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";

  const combined = `${lower} ${cause.toLowerCase()}`;

  if (
    combined.includes("gemini_api_key") ||
    combined.includes("nincs beállítva")
  ) {
    return "API_KEY";
  }
  if (/\b401\b/.test(combined) || /\b403\b/.test(combined)) {
    return "AUTH";
  }
  if (/\b429\b/.test(combined) || combined.includes("quota")) {
    return "QUOTA";
  }
  if (
    combined.includes("aborted") ||
    combined.includes("timeout") ||
    combined.includes("timed out")
  ) {
    return "TIMEOUT";
  }
  if (
    combined.includes("finishreason: safety") ||
    combined.includes("biztonsági szűrő") ||
    (combined.includes("blokkolva") && combined.includes("prompt"))
  ) {
    return "SAFETY";
  }
  if (
    combined.includes("max_tokens") ||
    combined.includes("tokenlimit") ||
    combined.includes("levágódott")
  ) {
    return "MAX_TOKENS";
  }
  if (
    combined.includes("üres válasz") ||
    combined.includes("üres szöveget") ||
    combined.includes("nincs candidatet") ||
    combined.includes("nincs content") ||
    combined.includes("nincs parts")
  ) {
    return "EMPTY_RESPONSE";
  }
  if (
    combined.includes("unable_to_verify") ||
    combined.includes("certificate") ||
    combined.includes("cert")
  ) {
    return "TLS_CERTIFICATE";
  }
  if (
    combined.includes("enotfound") ||
    combined.includes("econnrefused") ||
    combined.includes("fetch failed") ||
    combined.includes("hálózati hiba")
  ) {
    return "NETWORK";
  }
  if (combined.includes("http 4") || combined.includes("http 5")) {
    return "API_HTTP";
  }
  return "UNKNOWN";
}

function buildHint(code: GeminiErrorCode): string | undefined {
  switch (code) {
    case "AUTH":
      return "Ellenőrizd a GEMINI_API_KEY / GOOGLE_API_KEY értékét a .env.local-ban és a Google AI Studio jogosultságait.";
    case "QUOTA":
      return "429 — kvóta vagy rate limit. Várj, vagy növeld a limitet a Google Cloud / AI Studio konzolon.";
    case "TIMEOUT":
      return "A kérés túl sokáig tartott. Próbáld újra; ha ismétlődik, csökkentsd a prompt méretét.";
    case "TLS_CERTIFICATE":
      if (isNodeDevelopment()) {
        return "Helyi fejlesztés: a Gemini kliens automatikusan engedékeny TLS-t használ. Indítsd újra a dev szervert (npm run dev:clean), ha most állítottad be a .env.local-t.";
      }
      return "Éles környezet: szigorú TLS aktív. Ellenőrizd a hálózatot és az API kulcsot.";
    case "NETWORK":
      return "A böngésző vagy a szerver nem érte el a Gemini API-t. Ellenőrizd az internetet, VPN-t és hogy a dev szerver fut-e.";
    case "API_KEY":
      return "Állítsd be a GEMINI_API_KEY értéket a .env.local fájlban, majd indítsd újra a dev szervert.";
    case "GEMINI_OVERLOAD":
      return "A Gemini szervere átmenetileg túlterhelt. A rendszer automatikusan újrapróbálta (3–8–15 mp várakozással). Várj 1–2 percet, majd indítsd újra a generálást.";
    case "DUPLICATE_VERSE":
      return "Ez nem API-hiba. A rendszer automatikusan újrapróbálta másik igehellyel (legfeljebb 3×). Indítsd újra a generálást.";
    case "API_HTTP":
      return "A Google API HTTP hibát adott — ellenőrizd a kulcs jogosultságait és a modell nevét. A terminálban a teljes API válasz naplózva van.";
    case "SAFETY":
      return "A modell biztonsági szűrője blokkolta a választ. Próbáld enyhébb megfogalmazással, vagy nézd a terminálban a safetyRatings mezőt.";
    case "EMPTY_RESPONSE":
      return "A kapcsolat valószínűleg működik, de a válaszban nem volt olvasható szöveg. Nézd a terminálban a „Raw Gemini Response” diagnosztikát.";
    case "MAX_TOKENS":
      return "A kapcsolat működik, de a válasz túl hosszú lett vagy levágódott. A rendszer automatikusan újrapróbál rövidebb instrukcióval; ha ismétlődik, csökkentsd a kért tartalom hosszát (tömör, max. 1200–1800 szó).";
    case "UNKNOWN":
      if (isNodeDevelopment()) {
        return "Nézd a terminálban a [gemini-api] FAILURE naplót (HTTP státusz, teljes válasz test).";
      }
      return undefined;
    default:
      return undefined;
  }
}

export function toGeminiErrorDetails(error: unknown): GeminiErrorDetails {
  if (isDuplicateVerseExhaustedError(error)) {
    return {
      message: getUserFriendlyGeminiMessage("DUPLICATE_VERSE", error.message),
      code: "DUPLICATE_VERSE",
      hint: buildHint("DUPLICATE_VERSE"),
      tlsMode: getGeminiTlsMode(),
      isDevelopment: isNodeDevelopment(),
    };
  }

  if (isGeminiOverloadError(error)) {
    const exhausted =
      error instanceof Error &&
      error.message === getGeminiOverloadExhaustedMessage();
    const code: GeminiErrorCode = "GEMINI_OVERLOAD";
    const apiCause = error instanceof Error ? error.cause : undefined;

    return {
      message: exhausted
        ? getUserFriendlyGeminiMessage(code)
        : getUserFriendlyGeminiMessage(code, formatGeminiErrorMessage(error)),
      code,
      hint: buildHint(code),
      tlsMode: getGeminiTlsMode(),
      isDevelopment: isNodeDevelopment(),
      debug:
        isGeminiDebugUiEnabled() && isGeminiApiError(apiCause)
          ? buildDebugFromApiError(apiCause)
          : undefined,
    };
  }

  const technicalMessage = formatGeminiErrorMessage(error);
  const code = detectErrorCode(error, technicalMessage);
  const message = getUserFriendlyGeminiMessage(
    code,
    isGeminiResponseError(error) ? technicalMessage : undefined
  );

  const base: GeminiErrorDetails = {
    message,
    code,
    hint: buildHint(code),
    tlsMode: getGeminiTlsMode(),
    isDevelopment: isNodeDevelopment(),
    finishReason: isGeminiResponseError(error) ? error.finishReason : undefined,
    diagnostics: isGeminiResponseError(error) ? error.diagnostics : undefined,
  };

  if (isGeminiDebugUiEnabled() && isGeminiApiError(error)) {
    base.debug = buildDebugFromApiError(error);
  } else if (
    isGeminiDebugUiEnabled() &&
    error instanceof Error &&
    isGeminiApiError(error.cause)
  ) {
    base.debug = buildDebugFromApiError(error.cause);
  }

  return base;
}

/** API JSON válasz — felhasználóbarát error + opcionális debug. */
export function buildGeminiErrorApiPayload(
  details: GeminiErrorDetails
): Record<string, unknown> {
  return {
    error: details.message,
    code: details.code,
    hint: details.hint,
    tlsMode: details.tlsMode,
    isDevelopment: details.isDevelopment,
    finishReason: details.finishReason,
    diagnostics: details.diagnostics,
    ...(details.debug ? { debug: details.debug } : {}),
  };
}
