import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, SESSION_COOKIE, SESSION_COOKIE_DOMAIN } from "@/lib/auth";

// Simple in-memory rate limit: 10 attempts / 10min per IP.
const attempts = new Map<string, { count: number; reset: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.reset) {
    attempts.set(ip, { count: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }
  try {
    const body = await req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 });
    }

    // The tenant is implied by the subdomain the user arrived on (x-tenant-slug
    // is set by middleware.ts from the host). This keeps crk's users out of
    // any other tenant. Fall back to body.slug (sent by the login form's
    // optional workspace input) when the header is missing.
    const slug = (req.headers.get("x-tenant-slug") ?? String(body.slug ?? "").toLowerCase().trim())?.toLowerCase().trim() || null;
    const tenant = slug
      ? await prisma.tenant.findUnique({ where: { slug } })
      : null;
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Unknown workspace. Check the URL you opened." },
        { status: 404 }
      );
    }
    if (tenant.status !== "active") {
      return NextResponse.json(
        { success: false, error: "This workspace is inactive. Contact support." },
        { status: 403 }
      );
    }

    const employee = await prisma.employee.findFirst({
      where: { tenantId: tenant.id, email },
    });
    if (!employee || !(await verifyPassword(password, employee.password))) {
      return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
    }
    if (employee.status !== "active") {
      return NextResponse.json({ success: false, error: "Your account is inactive. Contact your admin." }, { status: 403 });
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signToken({ sub: employee.id, role: employee.role, tenantId: employee.tenantId });
    const res = NextResponse.json({ success: true, role: employee.role });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      domain: SESSION_COOKIE_DOMAIN,
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
