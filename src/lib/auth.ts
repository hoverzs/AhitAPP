import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "ahit_admin_session";

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "devotional-admin";
}

export function isValidAdminPassword(password: string): boolean {
  return password === getAdminPassword();
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return token === getAdminPassword();
}
