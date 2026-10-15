import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, signToken, SESSION_COOKIE, SESSION_COOKIE_DOMAIN } from "@/lib/auth";
import { passwordError, portalHome } from "@/lib/ess-login";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "superadmin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const employee = await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId, status: "active" } });
  if (!employee?.password || employee.sessionVersion !== (session.sessionVersion ?? 0)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const current = String(body.currentPassword ?? ""), password = String(body.password ?? "");
  if (current.length > 128) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  const error = passwordError(password);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!(await verifyPassword(current, employee.password))) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  if (await verifyPassword(password, employee.password)) return NextResponse.json({ error: "Choose a different password from your current password." }, { status: 400 });
  const hashed = await hashPassword(password);
  const changed = await prisma.$transaction(async tx => {
    const result = await tx.employee.updateMany({ where: { id: employee.id, tenantId: session.tenantId, status: "active", sessionVersion: employee.sessionVersion, password: employee.password }, data: { password: hashed, mustChangePassword: false, sessionVersion: { increment: 1 } } });
    if (result.count) await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: employee.id, actorRole: employee.role, action: "employee.password.changed", entity: "Employee", entityId: employee.id, summary: `${employee.firstName} ${employee.lastName} (${employee.employeeNumber}) changed their password` } });
    return result.count;
  });
  if (!changed) return NextResponse.json({ error: "Account changed. Please sign in again." }, { status: 409 });
  const res = NextResponse.json({ success: true, next: portalHome(employee.role) });
  res.cookies.set(SESSION_COOKIE, signToken({ sub: employee.id, role: employee.role, tenantId: employee.tenantId, sessionVersion: employee.sessionVersion + 1 }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", domain: SESSION_COOKIE_DOMAIN, maxAge: 60 * 60 * 24 * 30 });
  return res;
}
