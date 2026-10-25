import type { AdminIndexEntry } from "./storage/types";
import type { AdminDevotionalListItem, Devotional } from "./types";

/** Könnyű index-sor → admin listasor (nincs szükség a teljes rekordra). */
export function entryToListItem(entry: AdminIndexEntry): AdminDevotionalListItem {
  return {
    date: entry.date,
    title: entry.title,
    verse: entry.verse ?? "",
    status: entry.status,
    generatedAt: entry.generatedAt,
    updatedAt: entry.updatedAt,
    editedByAdmin: entry.editedByAdmin,
    category: entry.category,
  };
}

/**
 * Index-sorból épített „csonk" rekord (üres tartalommal). Csak a generálási
 * cél és az admin kontextus számításához való (dátum, státusz,
 * lastApiError) — megjelenítésre és mentésre soha nem használható.
 */
export function entryToStub(entry: AdminIndexEntry): Devotional {
  const stamp = entry.generatedAt ?? entry.updatedAt ?? `${entry.date}T00:00:00.000Z`;
  return {
    date: entry.date,
    title: entry.title,
    weekId: entry.weekId,
    verse: entry.verse ?? "",
    content: "",
    imageUrl: "",
    createdAt: stamp,
    generatedAt: entry.generatedAt,
    updatedAt: entry.updatedAt,
    status: entry.status,
    category: entry.category,
    editedByAdmin: entry.editedByAdmin,
    lastApiError: entry.lastApiError,
  };
}
