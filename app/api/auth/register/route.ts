import { NextRequest, NextResponse } from "next/server";
import { onboardTenant, isValidWorkspaceSlug } from "@/lib/onboarding";
import { signToken, SESSION_COOKIE } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const companyName = String(body.companyName ?? "").trim();
    const slug = String(body.slug ?? "").trim();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (companyName.length < 2 || companyName.length > 120) {
      return NextResponse.json({ success: false, error: "Company name must be 2–120 characters." }, { status: 400 });
    }
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ success: false, error: "Your name must be 2–100 characters." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
    }
    if (!isValidWorkspaceSlug(slug)) {
      return NextResponse.json({ success: false, error: "Choose a valid workspace subdomain." }, { status: 400 });
    }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 12 characters and include upper-case, lower-case and a number." },
        { status: 400 }
      );
    }

    const { tenant, admin } = await onboardTenant({ companyName, slug, name, email, password });
    const token = signToken({ sub: admin.id, role: admin.role, tenantId: tenant.id });
    const res = NextResponse.json({ success: true, role: admin.role, companyName: tenant.name, slug: tenant.slug });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
