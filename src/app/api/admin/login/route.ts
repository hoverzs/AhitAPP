import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  getAdminPassword,
  isValidAdminPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  let password: string;
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 });
  }

  if (!isValidAdminPassword(password)) {
    return NextResponse.json(
      { error: "A megadott jelszó nem egyezik. Kérjük, próbálja újra." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE_NAME, getAdminPassword(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
