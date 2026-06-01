import { AdminButton } from "./AdminButton";
import { AdminPanel } from "./AdminPanel";
import {
  getGeminiErrorTitle,
  type GeminiErrorDebugInfo,
} from "@/lib/gemini-error-labels";
import { formatGeminiDebugMeta } from "@/lib/gemini-debug-display";

export function AdminErrorAlert({
  title,
  message,
  hint,
  meta,
}: {
  title: string;
  message: string;
  hint?: string;
  meta?: string;
}) {
  return (
    <div className="admin-alert admin-alert-error" role="alert">
      <p className="admin-alert-title">{title}</p>
      <p className="admin-alert-message">{message}</p>
      {hint && <p className="admin-alert-hint">{hint}</p>}
      {meta && <p className="admin-alert-meta">{meta}</p>}
    </div>
  );
}

export function AdminToast({ message }: { message: string }) {
  return (
    <div className="admin-toast" role="status">
      <span className="admin-toast-icon" aria-hidden>
        ✓
      </span>
      {message}
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div className="admin-modal-backdrop">
      <AdminPanel title={title} className="admin-modal max-w-md w-full">
        <p className="text-sm text-ink-muted leading-relaxed">{message}</p>
        <div className="mt-6 flex gap-3 justify-end">
          <AdminButton variant="ghost" onClick={onCancel}>
            Mégse
          </AdminButton>
          <AdminButton variant="regenerate" onClick={onConfirm} disabled={loading}>
            {loading ? "Folyamatban…" : confirmLabel}
          </AdminButton>
        </div>
      </AdminPanel>
    </div>
  );
}

export function AdminGeminiError({
  code,
  error,
  hint,
  tlsMode,
  debug,
}: {
  code?: string;
  error?: string;
  hint?: string;
  tlsMode?: string;
  debug?: GeminiErrorDebugInfo;
}) {
  const debugMeta = formatGeminiDebugMeta(debug);
  return (
    <AdminErrorAlert
      title={getGeminiErrorTitle(code)}
      message={error ?? "Ismeretlen hiba."}
      hint={hint}
      meta={
        [code, tlsMode, debugMeta].filter(Boolean).join(" · ") || undefined
      }
    />
  );
}
