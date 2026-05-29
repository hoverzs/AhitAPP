import type { NextRequest } from "next/server";

/** Vercel Cron: Authorization: Bearer <CRON_SECRET> */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) {
    return true;
  }

  const querySecret = request.nextUrl.searchParams.get("secret");
  return querySecret === secret;
}
