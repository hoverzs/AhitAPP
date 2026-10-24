import { lookupPublicDevotionalByDate } from "./devotionals";
import type { Devotional } from "./types";

/**
 * A publikus áhítat-detail oldal lehetséges kimenetei. Csak az elmúlt 8 nap
 * közzétett áhítata érhető el; minden más külön, érthető állapot.
 */
export type DevotionalViewResult =
  | { kind: "ok"; devotional: Devotional }
  | { kind: "missing" }
  | { kind: "expired" }
  | { kind: "error" };

export async function resolveDevotionalView(
  date: string
): Promise<DevotionalViewResult> {
  try {
    const result = await lookupPublicDevotionalByDate(date);
    if (result.kind === "found") {
      return { kind: "ok", devotional: result.devotional };
    }
    return { kind: result.kind };
  } catch (error) {
    console.error(`[devotional-view] date=${date} → STORAGE ERROR`, error);
    return { kind: "error" };
  }
}
