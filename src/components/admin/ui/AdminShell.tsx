import type { ReactNode } from "react";

interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  return <div className="admin-shell">{children}</div>;
}

export function AdminMain({ children }: { children: ReactNode }) {
  return (
    <main className="admin-container admin-main">
      {children}
    </main>
  );
}
