"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label: string;
  successLabel?: string;
  className?: string;
}

export function CopyButton({
  text,
  label,
  successLabel = "Másolva!",
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-gold-500/40 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-soft transition-all hover:border-gold-500 hover:bg-gold-400/10 hover:text-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-400/50 ${className}`}
    >
      {copied ? successLabel : label}
    </button>
  );
}
