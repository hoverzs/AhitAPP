import type { ReactNode } from "react";

interface DashboardCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  variant?: "default" | "featured" | "quiet";
  flush?: boolean;
}

export function DashboardCard({
  title,
  icon,
  children,
  className = "",
  headerAction,
  variant = "default",
  flush = false,
}: DashboardCardProps) {
  const shellClass =
    variant === "featured"
      ? "card-premium-featured"
      : variant === "quiet"
        ? "card-premium border-ivory-200/70 shadow-soft"
        : "card-premium";

  const titleClass =
    variant === "featured"
      ? "font-serif text-xl font-semibold text-ink tracking-tight"
      : "font-serif text-lg font-semibold text-ink tracking-tight";

  return (
    <section className={`${shellClass} ${className}`}>
      <header className="flex items-center justify-between gap-3 px-6 py-5 border-b border-ivory-200/80 bg-ivory-100/40">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="flex-shrink-0 text-gold-600 w-5 h-5 flex items-center justify-center opacity-90">
              {icon}
            </span>
          )}
          <h2 className={`${titleClass} truncate`}>{title}</h2>
        </div>
        {headerAction}
      </header>
      <div className={flush ? "flex-1 flex flex-col min-h-0" : "p-6 flex-1 flex flex-col"}>
        {children}
      </div>
    </section>
  );
}
