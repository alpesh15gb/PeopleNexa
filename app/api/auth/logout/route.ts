import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_DOMAIN } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    domain: SESSION_COOKIE_DOMAIN,
    maxAge: 0,
  });
  return res;
}
