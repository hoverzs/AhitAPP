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
      <header className="flex items-center gap-2.5 px-5 py-3.5 border-b border-ivory-200/60">
        {icon && (
          <span className="flex-shrink-0 text-gold-600/80 w-4 h-4 flex items-center justify-center">
            {icon}
          </span>
        )}
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {title}
        </h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
