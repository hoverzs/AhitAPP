import bundledRaw from "../../../data/devotionals.json";
import { parseDevotionalList } from "./devotional-validate";
import type { Devotional } from "../types";

/** Deploy bundle-ből — Vercel serverlessben megbízhatóbb, mint fs.readFile. */
export function getBundledDevotionalsForSeed(): Devotional[] {
  return parseDevotionalList(bundledRaw);
}
