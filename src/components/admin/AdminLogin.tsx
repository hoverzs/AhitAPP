"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoBrandTitle, LogoMark } from "@/components/Logo";
import { APP_NAME } from "@/lib/brand";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "A megadott jelszó nem egyezik. Kérjük, próbálja újra.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Nem sikerült csatlakozni a szerverhez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-shell">
      <div className="admin-login-card">
        <div className="text-center mb-8">
          <LogoMark className="w-14 h-14 mx-auto mb-4" />
          <div className="flex justify-center mb-3">
            <LogoBrandTitle size="sm" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Admin belépés</h1>
          <p className="mt-2 text-sm text-ink-muted">{APP_NAME} tartalomkezelő</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="admin-editor-field">
            <label htmlFor="admin-password">Jelszó</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-editor-input mt-2"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 border border-red-200/70 text-center" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="admin-btn admin-btn-primary admin-btn-lg w-full disabled:opacity-60"
          >
            {loading ? "Belépés…" : "Belépés"}
          </button>
        </form>
      </div>

      <Link
        href="/"
        className="mt-8 text-sm text-ink-muted hover:text-gold-600 transition-colors"
      >
        ← Vissza a kezdőlapra
      </Link>
    </div>
  );
}
