import type { NextRequest } from "next/server";
import { isAdminAuthenticated } from "./auth";

function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret || null;
}

/**
 * Vercel / külső cron hitelesítés.
 * Elsődleges: Authorization: Bearer <CRON_SECRET>
 * Tartalék: ?secret=<CRON_SECRET> (nem ajánlott élesben)
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = getCronSecret();
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) {
    return true;
  }

  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  return querySecret === secret;
}

/** Cron Bearer token vagy bejelentkezett admin munkamenet. */
export async function isAuthorizedCronOrAdminRequest(
  request: NextRequest
): Promise<"cron" | "admin" | false> {
  if (isAuthorizedCronRequest(request)) {
    return "cron";
  }
  if (await isAdminAuthenticated()) {
    return "admin";
  }
  return false;
}
