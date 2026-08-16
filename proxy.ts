import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moduleForPath } from "@/lib/modules";
import { getTenantAccess } from "@/lib/modules-server";

// Base domain for tenant subdomains, e.g. crk.peoplenexa.in. Overridable via
// APP_BASE_DOMAIN so staging/alternate domains work without code changes.
const BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? "peoplenexa.in";

// Endpoints reachable without any session (health checks, cron, auth itself).
const PUBLIC_API_PREFIXES = ["/api/health", "/api/auth", "/api/i18n", "/api/cron"];

/**
 * Resolve the tenant slug from the request host:
 *   crk.peoplenexa.in    → crk   (production)
 *   crk.localhost:3000   → crk   (local dev)
 *   localhost:3000       → crk   (dev fallback → demo tenant)
 *   X-Tenant-Slug header → explicit override (API/testing)
 */
function resolveSlug(request: NextRequest): string | null {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  const header = request.headers.get("x-tenant-slug");
  if (header) return header;
  if (hostname.endsWith(`.${BASE_DOMAIN}`) && parts.length >= 3) return parts[0];
  if (hostname.endsWith(".localhost") && parts.length >= 2) return parts[0];
  if (hostname === "localhost" || hostname === "127.0.0.1") return "crk";
  return null;
}

/** Pass the request through with the tenant slug attached for the handler. */
function passWithTenant(request: NextRequest, slug: string | null) {
  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

function json(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const slug = resolveSlug(request);
  const isApiRoute = pathname.startsWith("/api");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;

  // ── Super admin area ─────────────────────────────────────────────────────
  if (pathname.startsWith("/superadmin")) {
    const isLogin = pathname === "/superadmin/login";
    const isSuper = payload?.role === "superadmin";
    if (isSuper && isLogin) {
      return NextResponse.redirect(new URL("/superadmin", request.url));
    }
    if (!isSuper && !isLogin) {
      return NextResponse.redirect(new URL("/superadmin/login", request.url));
    }
    return passWithTenant(request, slug);
  }

  // ── API routes: attach tenant context; each handler does its own auth. ───
  if (isApiRoute) {
    // License gate for authenticated tenant APIs (login/register/health/cron
    // run before a session exists and are exempt).
    if (payload && payload.role !== "superadmin" && payload.tenantId && !isPublicApi) {
      const access = await getTenantAccess(payload.tenantId);
      if (access.status !== "active" || isExpired(access)) {
        return json("Your workspace license is inactive. Contact support.", 403);
      }
      const mod = moduleForPath(pathname);
      if (mod && !access.modules.has(mod)) {
        return json(`The ${mod} module is not enabled for your workspace.`, 403);
      }
    }
    return passWithTenant(request, slug);
  }

  const isAdminRoute = pathname.startsWith("/admin");
  const isEmployeeRoute = pathname.startsWith("/employee");

  // A valid JWT signature is not enough on its own: the employee must still
  // exist and be active. Tokens that survive a DB reset (or reference a
  // deleted/inactive employee) would otherwise bounce between /login and the
  // portal forever — proxy considers them authed, the layout can't find them.
  let role: string | null = null;
  let tenantId: string | null = null;
  if (payload) {
    try {
      if (payload.role === "superadmin") {
        const sa = await prisma.superAdmin.findUnique({ where: { id: payload.sub } });
        if (sa) {
          role = "superadmin";
          return NextResponse.redirect(new URL("/superadmin", request.url));
        }
      } else {
        const employee = await prisma.employee.findUnique({
          where: { id: payload.sub },
          select: { role: true, status: true, tenantId: true },
        });
        if (employee && employee.status === "active") {
          role = employee.role;
          tenantId = employee.tenantId;
        }
      }
    } catch {
      // DB unavailable — fall back to the token claim so the app isn't
      // taken down by a transient database error.
      role = payload.role === "superadmin" ? "superadmin" : payload.role;
      tenantId = payload.tenantId ?? null;
    }
  }

  const authed = Boolean(role);
  if (!authed) {
    if (isAdminRoute || isEmployeeRoute) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      // Invalid, expired, or stale token — clear it so the user can log in
      // fresh instead of being stuck in a redirect loop.
      if (token) clearSessionCookie(res);
      return res;
    }
    if (token) {
      // Stale cookie on the auth pages themselves: drop it and serve the page.
      return clearSessionCookie(passWithTenant(request, slug));
    }
    return passWithTenant(request, slug);
  }

  if (pathname === "/login" || pathname === "/register") {
    return NextResponse.redirect(
      new URL(role === "admin" ? "/admin" : "/employee", request.url)
    );
  }
  if (isAdminRoute && role !== "admin") {
    return NextResponse.redirect(new URL("/employee", request.url));
  }

  // ── License + module gating for portal pages ─────────────────────────────
  if (role !== "superadmin" && tenantId) {
    const access = await getTenantAccess(tenantId);
    if (access.status !== "active" || isExpired(access)) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      if (token) clearSessionCookie(res);
      return res;
    }
    const mod = moduleForPath(pathname);
    if (mod && !access.modules.has(mod)) {
      const target = role === "admin" ? "/admin" : "/employee";
      return NextResponse.redirect(
        new URL(`${target}/module-unavailable?m=${encodeURIComponent(mod)}`, request.url)
      );
    }
  }

  return passWithTenant(request, slug);
}

function isExpired(access: { subscriptionExpiry: Date | null }) {
  return Boolean(access.subscriptionExpiry && access.subscriptionExpiry.getTime() < Date.now());
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/employee/:path*",
    "/notifications",
    "/login",
    "/register",
    "/superadmin/:path*",
    "/api/:path*",
  ],
};

export default proxy;
