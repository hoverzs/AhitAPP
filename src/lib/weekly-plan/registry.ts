import { addDaysToIsoDate } from "../app-date";
import type { PlanRegistry, RegistryEntry, WeeklyPlan } from "./types";

/** Ennyi napig őrizzük az igehelyeket és heti témákat az ismétlődés ellen. */
export const REGISTRY_RETENTION_DAYS = 90;

export function emptyRegistry(): PlanRegistry {
  return { version: 1, entries: [] };
}

/** A 90 napnál régebbi (a mai naptól visszaszámolva) sorok elhagyása. */
export function pruneRegistry(registry: PlanRegistry, today: string): PlanRegistry {
  const cutoff = addDaysToIsoDate(today, -REGISTRY_RETENTION_DAYS);
  return {
    version: 1,
    entries: registry.entries.filter((e) => e.date >= cutoff),
  };
}

/** Napra egyedi összefésülés: az azonos dátumú sort az új váltja; régi sorok kihullanak. */
export function mergeRegistryEntries(
  registry: PlanRegistry,
  entries: RegistryEntry[],
  today: string
): PlanRegistry {
  const byDate = new Map(registry.entries.map((e) => [e.date, e]));
  for (const entry of entries) byDate.set(entry.date, entry);
  return pruneRegistry(
    {
      version: 1,
      entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    },
    today
  );
}

/** A jóváhagyott terv sorai a nyilvántartáshoz. */
export function registryEntriesFromPlan(plan: WeeklyPlan): RegistryEntry[] {
  return plan.days
    .filter((d) => d.verse.trim())
    .map((d) => ({
      date: d.date,
      reference: d.verse,
      title: d.title,
      category: d.category || undefined,
      theme: plan.theme || undefined,
      weekId: plan.weekId,
    }));
}

export function parseRegistry(text: string): PlanRegistry | null {
  try {
    const parsed = JSON.parse(text) as PlanRegistry;
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return { version: 1, entries: parsed.entries };
  } catch {
    return null;
  }
}
