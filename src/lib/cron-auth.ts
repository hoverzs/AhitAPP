import type { NextRequest } from "next/server";
import { isAdminAuthenticated } from "./auth";

/** Vercel Cron: Authorization: Bearer <CRON_SECRET> */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
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
