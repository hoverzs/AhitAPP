import type { ReactNode } from "react";

interface SidebarPanelProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  id?: string;
}

/** Halk utility panel — főoldali oldalsáv elemekhez. */
export function SidebarPanel({ title, icon, children, id }: SidebarPanelProps) {
  return (
    <section id={id} className="sidebar-panel">
      <header className="sidebar-panel__header">
        {icon && (
          <span className="sidebar-category-icon flex-shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5">
            {icon}
          </span>
        )}
        <h2 className="sidebar-panel__title">{title}</h2>
      </header>
      <div className="sidebar-panel__body">{children}</div>
    </section>
  );
}
