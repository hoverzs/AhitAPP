import {
  extractVerseReference,
  type HistoricalDayEntry,
} from "../devotional-memory";
import { normalizeDevotional, normalizeDevotionalStatus } from "../devotional-status";
import type { BlobDevotionalStorage, MetaExtra } from "../storage/blob/blob-storage";
import { devotionalDateKey } from "../storage/devotional-validate";
import { planRetention } from "../storage/retention";
import type { Devotional } from "../types";

/**
 * Redis → Blob átvitel logikája (tiszta függvények + a Blob-oldali írás/ellenőrzés).
 * A Redis oldalt a scripts/redis-to-blob.ts olvassa (csak olvasás), a Blob
 * oldalt ugyanez a szkript egy MÁSIK futtatásban, fájlból írja.
 */

export const EXPORT_FILE_VERSION = 1;

export interface ExportFile {
  version: typeof EXPORT_FILE_VERSION;
  exportedAt: string;
  /** Az export napja (Europe/Bucharest) — a retention-határ ehhez számolódik. */
  referenceDate: string;
  source: "redis";
  /** MINDEN rekord (a meta a teljes előzményből épül). */
  records: Devotional[];
}

export interface MigrationPlan {
  referenceDate: string;
  cutoff: string | null;
  totalRecords: number;
  /** Átvitelre kerülő rekordok: minden, amit a retention is megtartana. */
  toImport: Devotional[];
  /** Átvitel nélkül maradó, régi + közzétett napok (a retention úgyis törölné). */
  skippedOldPublished: string[];
  /** Régi, de nem közzétett (piszkozat / jóváhagyott) napok — ezek átkerülnek. */
  oldUnpublishedKept: string[];
  newestDate: string | null;
  /** A teljes előzményből épített, a törölt napok emlékezetét őrző meta. */
  meta: MetaExtra;
  warnings: string[];
}

const RECENT_DAYS_LIMIT = 21;

/** A teljes előzményből a meta (használt igehelyek, címek, kategóriák). */
export function buildMigrationMeta(records: Devotional[]): MetaExtra {
  const sorted = [...records].sort((a, b) =>
    devotionalDateKey(a).localeCompare(devotionalDateKey(b))
  );
  const unique = (values: (string | undefined)[]) => [
    ...new Set(values.filter((v): v is string => Boolean(v && v.trim()))),
  ];

  const recentDays: HistoricalDayEntry[] = sorted.slice(-RECENT_DAYS_LIMIT).map((d) => ({
    date: devotionalDateKey(d),
    title: d.title,
    verseReference: extractVerseReference(d.verse),
    category: d.category ?? "—",
  }));

  return {
    usedVerseReferences: unique(sorted.map((d) => extractVerseReference(d.verse))),
    usedTitles: unique(sorted.map((d) => d.title)),
    usedCategories: unique(sorted.map((d) => d.category)),
    recentDays,
  };
}

export function planMigration(rawRecords: Devotional[], today: string): MigrationPlan {
  const records = rawRecords.map(normalizeDevotional);
  const warnings: string[] = [];

  const byDate = new Map<string, Devotional>();
  for (const d of records) {
    const date = devotionalDateKey(d);
    if (byDate.has(date)) warnings.push(`Duplikált dátum a forrásban: ${date} — az utolsó marad.`);
    byDate.set(date, d);
  }

  const unique = [...byDate.values()];
  const retention = planRetention(
    unique.map((d) => devotionalDateKey(d)),
    today
  );
  const removeSet = new Set(retention.remove);

  const skippedOldPublished: string[] = [];
  const oldUnpublishedKept: string[] = [];
  const toImport: Devotional[] = [];

  for (const d of unique) {
    const date = devotionalDateKey(d);
    const isOld = removeSet.has(date);
    const published = normalizeDevotionalStatus(d.status) === "published";
    if (isOld && published) {
      skippedOldPublished.push(date);
      continue;
    }
    if (isOld) oldUnpublishedKept.push(date);
    toImport.push(d);
  }

  toImport.sort((a, b) => devotionalDateKey(a).localeCompare(devotionalDateKey(b)));
  skippedOldPublished.sort();
  oldUnpublishedKept.sort();

  for (const d of toImport) {
    if (d.imageUrl?.startsWith("/") && !d.imageUrl.startsWith("//")) {
      warnings.push(
        `A(z) ${devotionalDateKey(d)} napi kép helyi útvonal (${d.imageUrl}) — Vercelen csak akkor létezik, ha a repóban van; a feltöltött képek nem vihetők át.`
      );
    }
  }

  const newest = [...unique].sort((a, b) =>
    devotionalDateKey(b).localeCompare(devotionalDateKey(a))
  )[0];

  return {
    referenceDate: today,
    cutoff: retention.cutoff,
    totalRecords: unique.length,
    toImport,
    skippedOldPublished,
    oldUnpublishedKept,
    newestDate: newest ? devotionalDateKey(newest) : null,
    meta: buildMigrationMeta(unique),
    warnings,
  };
}

export interface ImportResult {
  imported: string[];
  /** Már létezett a Blobban — nem írtuk felül. */
  skippedExisting: string[];
  metaMerged: boolean;
}

/**
 * Idempotens írás az ÚJ Blob store-ba: a már meglévő dátumot nem írja felül,
 * a metát beolvasztja (soha nem szűkít). Dry-run: csak számol.
 */
export async function importToBlob(
  storage: BlobDevotionalStorage,
  plan: MigrationPlan,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  const existing = new Set((await storage.listAdminEntries("0000-00-00")).map((e) => e.date));
  const result: ImportResult = { imported: [], skippedExisting: [], metaMerged: false };

  for (const d of plan.toImport) {
    const date = devotionalDateKey(d);
    if (existing.has(date)) {
      result.skippedExisting.push(date);
      continue;
    }
    if (!options.dryRun) await storage.saveDevotional(d);
    result.imported.push(date);
  }

  if (!options.dryRun) {
    await storage.mergeMeta(plan.meta);
    result.metaMerged = true;
  }
  return result;
}

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
}

/** Átvitel utáni ellenőrzés: a Blobban lévő adat egyezik a forrással. */
export async function verifyImport(
  storage: BlobDevotionalStorage,
  plan: MigrationPlan,
  today: string
): Promise<VerifyResult> {
  const checks: VerifyCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const entries = await storage.listAdminEntries("0000-00-00");
  const entryDates = new Set(entries.map((e) => e.date));

  const missingFromIndex = plan.toImport
    .map((d) => devotionalDateKey(d))
    .filter((date) => !entryDates.has(date));
  add(
    "index: minden átvitt nap szerepel",
    missingFromIndex.length === 0,
    missingFromIndex.length ? `hiányzik: ${missingFromIndex.join(", ")}` : undefined
  );

  const mismatches: string[] = [];
  for (const source of plan.toImport) {
    const date = devotionalDateKey(source);
    const stored = await storage.getDevotionalByDate(date);
    if (!stored) {
      mismatches.push(`${date}: nincs rekord`);
      continue;
    }
    for (const field of ["title", "verse", "content", "status", "imageUrl"] as const) {
      if (stored[field] !== source[field]) mismatches.push(`${date}: eltér a(z) ${field}`);
    }
  }
  add(
    "rekordok: tartalom és mezők egyeznek",
    mismatches.length === 0,
    mismatches.length ? mismatches.slice(0, 10).join("; ") : undefined
  );

  const cutoff = plan.cutoff ?? "0000-00-00";
  const expectedPublic = plan.toImport
    .filter(
      (d) =>
        normalizeDevotionalStatus(d.status) === "published" &&
        Boolean(d.content?.trim()) &&
        devotionalDateKey(d) >= cutoff &&
        devotionalDateKey(d) <= today
    )
    .map((d) => devotionalDateKey(d))
    .sort();
  const window = await storage.getPublicWindowDevotionals();
  const windowDates = (window ?? []).map((d) => devotionalDateKey(d)).sort();
  add(
    "nyilvános pillanatkép: a közzétett, ablakon belüli napok szerepelnek",
    window !== null && expectedPublic.every((d) => windowDates.includes(d)),
    window === null ? "nincs pillanatkép" : `várt: ${expectedPublic.join(", ") || "—"}; van: ${windowDates.join(", ") || "—"}`
  );

  const meta = await storage.getMeta();
  add(
    "meta: használt igehelyek megvannak",
    Boolean(meta) &&
      (plan.meta.usedVerseReferences ?? []).every((v) => meta?.usedVerseReferences.includes(v)),
    meta
      ? `igehelyek ${meta.usedVerseReferences.length}/${plan.meta.usedVerseReferences?.length ?? 0}`
      : "nincs meta"
  );

  return { ok: checks.every((c) => c.ok), checks };
}
