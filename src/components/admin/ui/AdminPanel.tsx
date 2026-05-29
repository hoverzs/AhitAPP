import type { ReactNode } from "react";

interface AdminPanelProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function AdminPanel({
  title,
  description,
  action,
  children,
  className = "",
  noPadding = false,
}: AdminPanelProps) {
  return (
    <section className={`admin-panel ${className}`}>
      {(title || action) && (
        <header className="admin-panel-header">
          <div className="min-w-0">
            {title && <h2 className="admin-panel-title">{title}</h2>}
            {description && (
              <p className="admin-panel-description">{description}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </header>
      )}
      <div className={noPadding ? "" : "admin-panel-body"}>{children}</div>
    </section>
  );
}
