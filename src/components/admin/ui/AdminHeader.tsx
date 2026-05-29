import Link from "next/link";
import type { AdminDevotionalContext } from "@/lib/types";
import type { Devotional } from "@/lib/types";
import { LogoBrandTitle, LogoMark } from "@/components/Logo";
import { AdminButton } from "./AdminButton";import { AdminStatusBadge } from "./AdminStatusBadge";

interface AdminHeaderProps {
  model: string;
  context: AdminDevotionalContext;
  publishedCount: number;
  preview: Devotional | null;
  onLogout: () => void;
}

export function AdminHeader({
  model,
  context,
  publishedCount,
  preview,
  onLogout,
}: AdminHeaderProps) {
  return (
    <header className="admin-header">
      <div className="admin-container admin-header-inner">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/30" aria-label="Kezdőlap">
            <LogoMark className="w-10 h-10" />
          </Link>
          <div className="min-w-0">
            <h1 className="admin-header-title flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <LogoBrandTitle size="sm" />
              <span className="font-sans text-sm md:text-base font-semibold text-ink-muted tracking-normal normal-case">
                Admin
              </span>
            </h1>
            <p className="admin-header-subtitle truncate">
              {publishedCount} közzétett nap · {model}
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 flex-wrap justify-center">
          {context.devReviewMode && (
            <span className="admin-chip admin-chip-warning">DEV mód</span>
          )}
          {context.autoPublishGenerated && (
            <span className="admin-chip">Auto publish</span>
          )}
          {context.cronEnabled && (
            <span className="admin-chip admin-chip-success">Cron aktív</span>
          )}
          {preview?.status && (
            <AdminStatusBadge status={preview.status} />
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <AdminButton variant="ghost" size="sm" onClick={onLogout}>
            Kijelentkezés
          </AdminButton>
        </div>
      </div>
    </header>
  );
}
