import { SidebarPanel } from "@/components/home/SidebarPanel";
import {
  IconDove,
  IconHeart,
  IconLeaf,
  IconShield,
} from "@/components/icons";

const CATEGORIES = [
  { label: "Reménység", icon: IconLeaf },
  { label: "Hit", icon: IconShield },
  { label: "Szeretet", icon: IconHeart },
  { label: "Békesség", icon: IconDove },
] as const;

export function CategoriesPanel() {
  return (
    <SidebarPanel title="Kategóriák">
      <ul className="space-y-1.5">
        {CATEGORIES.map(({ label, icon: Icon }) => (
          <li key={label}>
            <button
              type="button"
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-ink-muted transition-colors duration-200 hover:bg-amber-50/40 hover:text-gold-700"
              aria-label={`${label} kategória — hamarosan`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ivory-100/80 text-gold-600/75">
                <Icon className="w-3.5 h-3.5" />
              </span>
              {label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[10px] text-ink-muted/60 text-center uppercase tracking-wider">
        Hamarosan
      </p>
    </SidebarPanel>
  );
}
