import type { Devotional } from "../types";
import { getWeeklyJsonClient } from "./store";

/**
 * Egy áhítat teljes biztonsági mentése (a rekord minden mezőjével, a
 * verziótörténettel együtt) a privát adat store-ban: `backups/<dátum>/<időbélyeg>.json`.
 * A heti megőrzés (retention) ezeket nem törli — a mentés csak szándékos
 * lépéssel tűnik el. A heti csere előtt készül, hogy a régi szöveg
 * bármikor visszaállítható legyen.
 */
export const BACKUP_PREFIX = "backups/";

export interface DevotionalBackup {
  version: 1;
  kind: "devotional-backup";
  id: string;
  date: string;
  createdAt: string;
  reason: string;
  record: Devotional;
}

export function backupPath(date: string, id: string): string {
  return `${BACKUP_PREFIX}${date}/${id}.json`;
}

export interface CreatedBackup {
  id: string;
  path: string;
  backup: DevotionalBackup;
}

/** Új mentés; meglévőt soha nem ír felül (overwrite: false). */
export async function createDevotionalBackup(
  record: Devotional,
  reason: string,
  now: Date = new Date()
): Promise<CreatedBackup> {
  const client = getWeeklyJsonClient();
  const createdAt = now.toISOString();
  // Az azonosító időbélyegből áll; ütközésnél (azonos ezredmásodperc) számlálót kap.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `${createdAt.replace(/[:.]/g, "-")}${attempt ? `-${attempt}` : ""}`;
    const path = backupPath(record.date, id);
    const backup: DevotionalBackup = {
      version: 1,
      kind: "devotional-backup",
      id,
      date: record.date,
      createdAt,
      reason,
      record,
    };
    try {
      await client.putText(path, JSON.stringify(backup), { overwrite: false });
      return { id, path, backup };
    } catch (error) {
      if (error instanceof Error && error.name === "BlobAlreadyExistsError") continue;
      throw error;
    }
  }
  throw new Error("A biztonsági mentést nem sikerült egyedi azonosítóval létrehozni.");
}

export async function readDevotionalBackup(path: string): Promise<DevotionalBackup | null> {
  const current = await getWeeklyJsonClient().getText(path, { fresh: true });
  if (!current) return null;
  try {
    const parsed = JSON.parse(current.text) as DevotionalBackup;
    return parsed?.kind === "devotional-backup" && parsed.record ? parsed : null;
  } catch {
    return null;
  }
}
