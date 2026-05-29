import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Google AI / Gemini API kulcs — csak szerveroldalon.
 * Google precedencia: GOOGLE_API_KEY > GEMINI_API_KEY > GOOGLE_AI_API_KEY (legacy).
 */
export function getGeminiApiKey(): string {
  const key =
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "GEMINI_API_KEY nincs beállítva. Add hozzá a .env.local fájlhoz (Google AI Studio kulcs)."
    );
  }

  return key;
}

/** Hivatalos Gemini REST auth — támogatja az új AQ. formátumú kulcsokat is. */
export function getGeminiApiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("x-goog-api-key", getGeminiApiKey());
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export function createGeminiClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(getGeminiApiKey());
}

/** Részletes naplózás a terminálban — hálózati / TLS / API hibák diagnosztikájához. */
export function logGeminiError(error: unknown, context: string): void {
  console.error(`Detailed Gemini Error [${context}]:`, error);

  if (error instanceof Error) {
    console.error("  message:", error.message);
    console.error("  name:", error.name);
    if (error.stack) {
      console.error("  stack:", error.stack);
    }

    const cause = error.cause;
    if (cause !== undefined) {
      console.error("  cause:", cause);
      if (cause instanceof Error) {
        console.error("  cause.message:", cause.message);
        const errno = cause as NodeJS.ErrnoException;
        if (errno.code) {
          console.error("  cause.code:", errno.code);
        }
      }
    }
  }
}

export function formatGeminiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Ismeretlen Gemini hiba.";
  }

  if (error.name === "GeminiResponseError") {
    return error.message;
  }

  const cause =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === "string"
        ? error.cause
        : "";

  const base = error.message;
  if (!cause || base.includes(cause)) {
    return base;
  }

  if (cause.includes("UNABLE_TO_VERIFY") || cause.includes("certificate")) {
    return `${base} — TLS/SSL tanúsítvány hiba (proxy, víruskereső vagy hiányzó gyökértanúsítvány).`;
  }
  if (cause.includes("ENOTFOUND") || cause.includes("ECONNREFUSED")) {
    return `${base} — nincs internet vagy a Google API elérése blokkolva.`;
  }

  return `${base} (${cause})`;
}
