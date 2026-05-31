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
      <ul className="space-y-1">
        {CATEGORIES.map(({ label, icon: Icon }) => (
          <li key={label}>
            <button
              type="button"
              className="sidebar-category-btn"
              aria-label={`${label} kategória — hamarosan`}
            >
              <span className="sidebar-category-icon">
                <Icon className="w-3.5 h-3.5" />
              </span>
              {label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-ink-muted/55 text-center uppercase tracking-wider">
        Hamarosan
      </p>
    </SidebarPanel>
  );
}
