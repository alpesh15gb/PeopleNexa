import { cookies } from "next/headers";
import { verifyToken, SESSION_COOKIE, type SessionPayload } from "./auth";
import { prisma } from "./prisma";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return { sub: payload.sub, role: payload.role, tenantId: payload.tenantId };
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("unauthorized");
  }
  return session;
}

/**
 * JWT signature is not enough for mutations: the employee must still exist
 * and be active. Use this in API handlers that change data so deactivated
 * users (30-day tokens) can't keep writing.
 */
export async function requireActiveSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role === "superadmin") {
    const sa = await prisma.superAdmin.findUnique({ where: { id: session.sub }, select: { id: true } });
    if (!sa) throw new Error("unauthorized");
    return session;
  }
  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    select: { id: true, status: true, tenantId: true, role: true },
  });
  if (!employee || employee.status !== "active" || employee.tenantId !== session.tenantId) {
    throw new Error("unauthorized");
  }
  // Prefer the DB role so demotions take effect immediately.
  return { ...session, role: employee.role };
}
