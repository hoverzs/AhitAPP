import { getDevotionalByDate } from "./devotionals";
import { normalizeDevotionalStatus } from "./devotional-status";
import type { Devotional } from "./types";

/**
 * A publikus áhítat-detail oldal lehetséges kimenetei.
 * Külön ágak, hogy a felhasználó pontos okot lásson „Nem található" helyett.
 */
export type DevotionalViewResult =
  | { kind: "ok"; devotional: Devotional }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "unpublished"; devotional: Devotional }
  | { kind: "incomplete"; devotional: Devotional };

/**
 * Egységes belépési pont: ugyanazt a date-alapú adatmodellt használja, mint a
 * naptár és a főoldal. A naptár → detail eltérések debugolásához logol.
 */
export async function resolveDevotionalView(
  date: string
): Promise<DevotionalViewResult> {
  let devotional: Devotional | undefined;
  try {
    devotional = await getDevotionalByDate(date);
  } catch (error) {
    console.error(`[devotional-view] date=${date} → STORAGE ERROR`, error);
    return { kind: "error" };
  }

  if (!devotional) {
    console.warn(`[devotional-view] date=${date} → MISSING (nincs rekord)`);
    return { kind: "missing" };
  }

  const status = normalizeDevotionalStatus(devotional.status);
  const hasContent = Boolean(devotional.content?.trim());

  console.log(
    `[devotional-view] date=${date} dayNumber=${devotional.dayNumber} ` +
      `status=${status} hasContent=${hasContent} recordDate=${devotional.date ?? "(nincs)"}`
  );

  if (status !== "published") {
    console.warn(
      `[devotional-view] date=${date} → UNPUBLISHED (status=${status})`
    );
    return { kind: "unpublished", devotional };
  }

  if (!hasContent) {
    console.warn(`[devotional-view] date=${date} → INCOMPLETE (üres tartalom)`);
    return { kind: "incomplete", devotional };
  }

  return { kind: "ok", devotional };
}
