/**
 * TLS policy for outbound Gemini API calls.
 * Production (Vercel): strict certificate verification always.
 * Local development: relaxed verification for antivirus/SSL-inspection proxies.
 */

export function isNodeDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** True when outbound TLS verify may be relaxed (local dev, tsx scripts — not production). */
export function shouldRelaxGeminiTlsInDev(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

export type GeminiTlsMode = "strict" | "development-relaxed";

export function getGeminiTlsMode(): GeminiTlsMode {
  return shouldRelaxGeminiTlsInDev() ? "development-relaxed" : "strict";
}

export function getGeminiTlsRejectUnauthorized(): boolean {
  return !shouldRelaxGeminiTlsInDev();
}

export function logGeminiTlsModeOnce(): void {
  if (shouldRelaxGeminiTlsInDev()) {
    console.warn(
      "[gemini-tls] Development mode: Gemini API uses relaxed TLS verification (rejectUnauthorized: false) for local antivirus/proxy. Production keeps strict verification."
    );
  }
}
