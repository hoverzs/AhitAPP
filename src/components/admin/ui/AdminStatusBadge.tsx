import type { DevotionalStatus } from "@/lib/types";
import { statusLabelHu } from "@/lib/devotional-status";
import { ADMIN_STATUS_STYLES } from "./admin-styles";

interface AdminStatusBadgeProps {
  status: DevotionalStatus;
  className?: string;
}

export function AdminStatusBadge({ status, className = "" }: AdminStatusBadgeProps) {
  return (
    <span className={`${ADMIN_STATUS_STYLES[status]} ${className}`}>
      {statusLabelHu(status)}
    </span>
  );
}
