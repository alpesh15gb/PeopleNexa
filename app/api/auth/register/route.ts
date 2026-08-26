import { NextRequest, NextResponse } from "next/server";
import { onboardTenant } from "@/lib/onboarding";
import { signToken, SESSION_COOKIE, SESSION_COOKIE_DOMAIN } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyName, slug, name, email, password } = body as Record<string, string>;
    if (!companyName || !slug || !name || !email || !password) {
      return NextResponse.json({ success: false, error: "All fields are required." }, { status: 400 });
    }

    const { tenant, admin } = await onboardTenant({ companyName, slug, name, email, password });

    const token = signToken({ sub: admin.id, role: admin.role, tenantId: tenant.id });
    const res = NextResponse.json({ success: true, role: admin.role, companyName: tenant.name, slug: tenant.slug });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      domain: SESSION_COOKIE_DOMAIN,
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
