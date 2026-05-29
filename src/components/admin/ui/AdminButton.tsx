import type { ButtonHTMLAttributes, ReactNode } from "react";

export type AdminButtonVariant =
  | "default"
  | "primary"
  | "regenerate"
  | "edit"
  | "publish"
  | "danger"
  | "ghost";

const VARIANT_CLASSES: Record<AdminButtonVariant, string> = {
  default: "admin-btn admin-btn-default",
  primary: "admin-btn admin-btn-primary",
  regenerate: "admin-btn admin-btn-regenerate",
  edit: "admin-btn admin-btn-edit",
  publish: "admin-btn admin-btn-publish",
  danger: "admin-btn admin-btn-danger",
  ghost: "admin-btn admin-btn-ghost",
};

interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function AdminButton({
  variant = "default",
  size = "md",
  className = "",
  children,
  ...props
}: AdminButtonProps) {
  const sizeClass =
    size === "sm" ? "admin-btn-sm" : size === "lg" ? "admin-btn-lg" : "";

  return (
    <button
      type="button"
      className={`${VARIANT_CLASSES[variant]} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
