import type { DevotionalStatus } from "@/lib/types";

export const ADMIN_STATUS_STYLES: Record<DevotionalStatus, string> = {
  draft: "admin-badge admin-badge-draft",
  needs_review: "admin-badge admin-badge-review",
  approved: "admin-badge admin-badge-approved",
  published: "admin-badge admin-badge-published",
};
