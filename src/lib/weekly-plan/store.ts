import path from "path";
import { getAppTodayIso } from "../app-date";
import { getDataBlobClient, resolveStorageDriver } from "../storage";
import type { JsonBlobClient } from "../storage/blob/client";
import { mutateJsonDocument } from "../storage/blob/json-cas";
import { createLocalJsonClient } from "../storage/local-json-client";
import {
  emptyRegistry,
  mergeRegistryEntries,
  parseRegistry,
  registryEntriesFromPlan,
} from "./registry";
import {
  isWeekStart,
  validateWeeklyPlanStructure,
  WEEKLY_PLAN_VERSION,
  type PlanRegistry,
  type RegistryEntry,
  type WeeklyPlan,
} from "./types";

export const WEEKLY_PLAN_PREFIX = "plans/";
export const REGISTRY_PATH = "registry.json";

export function weeklyPlanPath(weekId: string): string {
  return `${WEEKLY_PLAN_PREFIX}${weekId}.json`;
}

export class WeeklyPlanValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Érvénytelen heti terv: ${issues.join(" ")}`);
    this.name = "WeeklyPlanValidationError";
  }
}

export class WeeklyPlanExistsError extends Error {
  constructor(weekId: string) {
    super(`Erre a hétre már van terv: ${weekId}.`);
    this.name = "WeeklyPlanExistsError";
  }
}

export class WeeklyPlanNotFoundError extends Error {
  constructor(weekId: string) {
    super(`Nincs terv erre a hétre: ${weekId}.`);
    this.name = "WeeklyPlanNotFoundError";
  }
}

export class WeeklyPlanUnsupportedError extends Error {
  constructor() {
    super("A heti terv csak Blob vagy helyi (local) tárolóval érhető el.");
    this.name = "WeeklyPlanUnsupportedError";
  }
}

function parsePlan(text: string): WeeklyPlan | null {
  try {
    const parsed = JSON.parse(text) as WeeklyPlan;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface WeeklyPlanStore {
  getPlan(weekId: string): Promise<WeeklyPlan | null>;
  /** Új terv; ha a hétre már van, WeeklyPlanExistsError. */
  createPlan(plan: WeeklyPlan): Promise<WeeklyPlan>;
  /** Meglévő terv módosítása (optimista zárolással); hiányzónál WeeklyPlanNotFoundError. */
  updatePlan(weekId: string, mutate: (current: WeeklyPlan) => WeeklyPlan): Promise<WeeklyPlan>;
  deletePlan(weekId: string): Promise<void>;
  getRegistry(): Promise<PlanRegistry>;
  /** Sorok beillesztése a nyilvántartásba; a 90 napnál régebbi kihullik. */
  recordInRegistry(entries: RegistryEntry[]): Promise<PlanRegistry>;
  /** Egy jóváhagyott terv igehelyeinek rögzítése a nyilvántartásban. */
  recordPlanInRegistry(plan: WeeklyPlan): Promise<PlanRegistry>;
}

export function createWeeklyPlanStore(
  client: JsonBlobClient,
  options: { now?: () => Date; today?: () => string } = {}
): WeeklyPlanStore {
  const now = options.now ?? (() => new Date());
  const today = options.today ?? (() => getAppTodayIso());

  /** Mentés előtti közös ellenőrzés + időbélyegek. */
  function finalize(weekId: string, next: WeeklyPlan, current: WeeklyPlan | null): WeeklyPlan {
    if (next.weekId !== weekId) {
      throw new WeeklyPlanValidationError([
        `A hét azonosítója nem változtatható (${weekId} → ${next.weekId}).`,
      ]);
    }
    const issues = validateWeeklyPlanStructure(next);
    if (issues.length > 0) throw new WeeklyPlanValidationError(issues);
    // Az updatedAt az ütközés-észlelés verziója: minden mentésnél szigorúan nő,
    // akkor is, ha két mentés ugyanabba a ezredmásodpercbe esik.
    let stamp = now().toISOString();
    if (current && stamp <= current.updatedAt) {
      stamp = new Date(Date.parse(current.updatedAt) + 1).toISOString();
    }
    return {
      ...next,
      version: WEEKLY_PLAN_VERSION,
      createdAt: current?.createdAt ?? next.createdAt ?? stamp,
      updatedAt: stamp,
    };
  }

  function assertWeekId(weekId: string): void {
    if (!isWeekStart(weekId)) {
      throw new WeeklyPlanValidationError([`A hét azonosítója nem érvényes hétfő: ${weekId}.`]);
    }
  }

  return {
    async getPlan(weekId) {
      assertWeekId(weekId);
      const current = await client.getText(weeklyPlanPath(weekId), { fresh: true });
      return current ? parsePlan(current.text) : null;
    },

    async createPlan(plan) {
      assertWeekId(plan.weekId);
      return mutateJsonDocument(client, weeklyPlanPath(plan.weekId), parsePlan, (current) => {
        if (current) throw new WeeklyPlanExistsError(plan.weekId);
        return finalize(plan.weekId, plan, null);
      });
    },

    async updatePlan(weekId, mutate) {
      assertWeekId(weekId);
      return mutateJsonDocument(client, weeklyPlanPath(weekId), parsePlan, (current) => {
        if (!current) throw new WeeklyPlanNotFoundError(weekId);
        return finalize(weekId, mutate(structuredClone(current)), current);
      });
    },

    async deletePlan(weekId) {
      assertWeekId(weekId);
      await client.del([weeklyPlanPath(weekId)]);
    },

    async getRegistry() {
      const current = await client.getText(REGISTRY_PATH, { fresh: true });
      return (current ? parseRegistry(current.text) : null) ?? emptyRegistry();
    },

    async recordInRegistry(entries) {
      return mutateJsonDocument(client, REGISTRY_PATH, parseRegistry, (current) =>
        mergeRegistryEntries(current ?? emptyRegistry(), entries, today())
      );
    },

    async recordPlanInRegistry(plan) {
      return this.recordInRegistry(registryEntriesFromPlan(plan));
    },
  };
}

let cachedStore: { driver: string; client: JsonBlobClient; store: WeeklyPlanStore } | null = null;

/**
 * A heti terv tára az aktív meghajtóhoz: Blob (éles) vagy fájlrendszer (local).
 * A Redis meghajtón nem érhető el — az amúgy is kivezetés alatt áll.
 */
export function getWeeklyPlanStore(): WeeklyPlanStore {
  const driver = resolveStorageDriver();
  let client: JsonBlobClient;
  if (driver === "blob") {
    client = getDataBlobClient();
  } else if (driver === "local") {
    client = createLocalJsonClient(path.join(process.cwd(), "data", "weekly"));
  } else {
    throw new WeeklyPlanUnsupportedError();
  }
  if (cachedStore && cachedStore.driver === driver && cachedStore.client === client) {
    return cachedStore.store;
  }
  const store = createWeeklyPlanStore(client);
  cachedStore = { driver, client, store };
  return store;
}
