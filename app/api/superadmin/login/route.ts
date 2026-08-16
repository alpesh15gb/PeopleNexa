import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 });
    }

    const sa = await prisma.superAdmin.findUnique({ where: { email } });
    if (!sa || !(await verifyPassword(password, sa.password))) {
      return NextResponse.json({ success: false, error: "Invalid credentials." }, { status: 401 });
    }

    const token = signToken({ sub: sa.id, role: "superadmin", tenantId: "" });
    const res = NextResponse.json({ success: true, role: "superadmin", name: sa.name });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
