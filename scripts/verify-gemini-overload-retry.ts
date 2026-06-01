/**
 * Ellenőrzés: 503 / UNAVAILABLE felismerés.
 * Futtatás: npx tsx scripts/verify-gemini-overload-retry.ts
 */
import {
  GEMINI_OVERLOAD_MAX_ATTEMPTS,
  GEMINI_OVERLOAD_RETRY_DELAYS_MS,
  isGeminiOverloadError,
} from "../src/lib/gemini-overload-retry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
  console.log("OK:", message);
}

assert(
  isGeminiOverloadError(new Error("Gemini API HTTP 503: high demand")),
  "HTTP 503 + high demand"
);
assert(
  isGeminiOverloadError(new Error('{"error":{"status":"UNAVAILABLE"}}')),
  "UNAVAILABLE JSON"
);
assert(
  !isGeminiOverloadError(new Error("Gemini API HTTP 400: bad request")),
  "400 is not overload"
);

assert(GEMINI_OVERLOAD_MAX_ATTEMPTS === 4, "4 total attempts");
assert(
  GEMINI_OVERLOAD_RETRY_DELAYS_MS.join(",") === "3000,8000,15000",
  "delays 3s, 8s, 15s"
);

console.log("\nAll overload retry checks passed.");
