/**
 * Fejlesztői ellenőrzési mód és automatikus publikálás.
 */
import { isNodeDevelopment } from "./gemini-tls";
import { isProductionDeployment } from "./cron-env";
import type { DevotionalStatus } from "./types";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return defaultValue;
}

export const DEV_REVIEW_MODE = envFlag("DEV_REVIEW_MODE", isNodeDevelopment());
export const AUTO_GENERATE_DAILY = envFlag("AUTO_GENERATE_DAILY", false);

/** Automatikus generálás után azonnal published legyen-e (production). */
export const AUTO_PUBLISH_GENERATED = envFlag("AUTO_PUBLISH_GENERATED", true);

export const PROMPT_VERSION =
  process.env.PROMPT_VERSION?.trim() || "2026-05-devotional-v6-stable";

export function isCronGenerationEnabled(): boolean {
  if (isProductionDeployment()) return true;
  return AUTO_GENERATE_DAILY;
}

/** Gemini generálás utáni alapértelmezett státusz. */
export function defaultGeneratedStatus(): DevotionalStatus {
  if (DEV_REVIEW_MODE) return "needs_review";
  if (AUTO_PUBLISH_GENERATED) return "published";
  return "needs_review";
}
