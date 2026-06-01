"use client";

import { useEffect, useState } from "react";
import { GEMINI_OVERLOAD_RETRY_DELAYS_MS } from "@/lib/gemini-overload-retry";

const BASE_MESSAGE =
  "Gemini szöveg + automatikus Pexels kép keresés — átlagosan 30–90 másodperc.";

/** Betöltő szövegek, igazítva a szerver oldali overload retry időzítéséhez. */
const LOADING_STAGES: { afterMs: number; text: string }[] = [
  { afterMs: 0, text: BASE_MESSAGE },
  {
    afterMs: 12_000,
    text: "Generálás folyamatban… Ha a Gemini szervere terhelt, automatikusan újrapróbáljuk.",
  },
  {
    afterMs: 12_000 + GEMINI_OVERLOAD_RETRY_DELAYS_MS[0] + 2000,
    text: "Első automatikus újrapróba a Gemini API-val (átmeneti túlterhelés)…",
  },
  {
    afterMs:
      12_000 +
      GEMINI_OVERLOAD_RETRY_DELAYS_MS[0] +
      GEMINI_OVERLOAD_RETRY_DELAYS_MS[1] +
      4000,
    text: "Második automatikus újrapróba — kérjük, ne zárd be az oldalt.",
  },
  {
    afterMs:
      12_000 +
      GEMINI_OVERLOAD_RETRY_DELAYS_MS[0] +
      GEMINI_OVERLOAD_RETRY_DELAYS_MS[1] +
      GEMINI_OVERLOAD_RETRY_DELAYS_MS[2] +
      6000,
    text: "Harmadik automatikus újrapróba — még egy kis türelem…",
  },
];

/**
 * Barátságos, változó betöltő szöveg generálás / cron közben.
 */
export function useGeminiLoadingMessage(active: boolean): string {
  const [message, setMessage] = useState(BASE_MESSAGE);

  useEffect(() => {
    if (!active) {
      setMessage(BASE_MESSAGE);
      return;
    }

    setMessage(LOADING_STAGES[0].text);
    const timers = LOADING_STAGES.slice(1).map(({ afterMs, text }) =>
      window.setTimeout(() => setMessage(text), afterMs)
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [active]);

  return message;
}
