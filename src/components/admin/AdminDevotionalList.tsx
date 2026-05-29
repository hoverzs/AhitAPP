"use client";

import type { AdminDevotionalListItem } from "@/lib/types";
import { AdminStatusBadge } from "@/components/admin/ui/AdminStatusBadge";
import { AdminButton } from "@/components/admin/ui/AdminButton";

function formatDt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("hu-HU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface AdminDevotionalListProps {
  items: AdminDevotionalListItem[];
  selectedDayNumber: number | null;
  onSelect: (dayNumber: number) => void;
  onEdit: (dayNumber: number) => void;
  onRegenerate: (dayNumber: number) => void;
  onRefine: (dayNumber: number) => void;
  onPublish: (dayNumber: number) => void;
  loadingDay?: number | null;
}

export function AdminDevotionalList({
  items,
  selectedDayNumber,
  onSelect,
  onEdit,
  onRegenerate,
  onRefine,
  onPublish,
  loadingDay,
}: AdminDevotionalListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-muted text-center py-12 font-serif italic">
        Még nincs áhítat. Generálj egyet a fenti panelen.
      </p>
    );
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Dátum</th>
            <th>Cím</th>
            <th>Igehely</th>
            <th>Státusz</th>
            <th>Generálva</th>
            <th>Módosítva</th>
            <th className="text-right">Műveletek</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.dayNumber}
              className={
                selectedDayNumber === item.dayNumber ? "admin-table-row-selected" : ""
              }
              onClick={() => onSelect(item.dayNumber)}
            >
              <td className="whitespace-nowrap">
                <span className="font-medium text-ink">{item.date}</span>
                <span className="block text-[11px] text-ink-muted mt-0.5">
                  #{item.dayNumber}
                </span>
              </td>
              <td className="max-w-[160px]">
                <span className="font-medium text-ink line-clamp-2">{item.title}</span>
                {item.editedByAdmin && (
                  <span className="block text-[10px] text-gold-600 mt-0.5">szerkesztve</span>
                )}
              </td>
              <td className="max-w-[130px] text-xs text-ink-muted truncate">
                {item.verse.length > 52 ? `${item.verse.slice(0, 52)}…` : item.verse}
              </td>
              <td>
                <AdminStatusBadge status={item.status} />
              </td>
              <td className="text-xs text-ink-muted whitespace-nowrap">
                {formatDt(item.generatedAt)}
              </td>
              <td className="text-xs text-ink-muted whitespace-nowrap">
                {formatDt(item.updatedAt)}
              </td>
              <td className="text-right whitespace-nowrap">
                <div
                  className="flex flex-wrap gap-1.5 justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AdminButton
                    variant="edit"
                    size="sm"
                    onClick={() => onEdit(item.dayNumber)}
                  >
                    Szerkesztés
                  </AdminButton>
                  <AdminButton
                    variant="regenerate"
                    size="sm"
                    disabled={loadingDay === item.dayNumber}
                    onClick={() => onRegenerate(item.dayNumber)}
                  >
                    {loadingDay === item.dayNumber ? "…" : "Újragenerálás"}
                  </AdminButton>
                  <AdminButton
                    variant="default"
                    size="sm"
                    onClick={() => onRefine(item.dayNumber)}
                  >
                    AI finomítás
                  </AdminButton>
                  {item.status !== "published" && (
                    <AdminButton
                      variant="publish"
                      size="sm"
                      onClick={() => onPublish(item.dayNumber)}
                    >
                      Közzététel
                    </AdminButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
