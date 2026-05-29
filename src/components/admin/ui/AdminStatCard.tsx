import type { ReactNode } from "react";

interface AdminStatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "default" | "success" | "warning" | "muted";
}

const ACCENT_RING: Record<NonNullable<AdminStatCardProps["accent"]>, string> = {
  default: "",
  success: "admin-stat-success",
  warning: "admin-stat-warning",
  muted: "admin-stat-muted",
};

export function AdminStatCard({
  label,
  value,
  hint,
  accent = "default",
}: AdminStatCardProps) {
  return (
    <div className={`admin-stat-card ${ACCENT_RING[accent]}`}>
      <p className="admin-stat-label">{label}</p>
      <div className="admin-stat-value">{value}</div>
      {hint && <p className="admin-stat-hint">{hint}</p>}
    </div>
  );
}
