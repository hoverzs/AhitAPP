import Link from "next/link";

interface AdminNavLinkProps {
  variant?: "glass" | "default";
}

/** Diszkrét admin belépési link a publikus fejlécben. */
export function AdminNavLink({ variant = "default" }: AdminNavLinkProps) {
  const isGlass = variant === "glass";

  return (
    <Link
      href="/admin/login"
      className={`text-xs font-medium tracking-wide transition-colors duration-300 ${
        isGlass
          ? "text-ink-muted/75 hover:text-gold-600 px-2.5 py-1.5 rounded-lg border border-white/30 bg-white/25 hover:bg-white/50 hover:border-gold-500/25 backdrop-blur-sm"
          : "text-ink-muted/80 hover:text-gold-600 px-2.5 py-1.5 rounded-lg border border-transparent hover:bg-ivory-100 hover:border-gold-500/15"
      }`}
    >
      Admin
    </Link>
  );
}
