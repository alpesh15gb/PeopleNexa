import { cookies } from "next/headers";
import { verifyToken, SESSION_COOKIE, type SessionPayload } from "./auth";
import { prisma } from "./prisma";

async function readActiveIdentity(): Promise<{ session: SessionPayload; mustChangePassword: boolean } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const session = { sub: payload.sub, role: payload.role, tenantId: payload.tenantId, sessionVersion: payload.sessionVersion };
  if (session.role === "superadmin") {
    const sa = await prisma.superAdmin.findUnique({ where: { id: session.sub }, select: { id: true } });
    return sa ? { session, mustChangePassword: false } : null;
  }
  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    select: { id: true, status: true, tenantId: true, role: true, mustChangePassword: true, sessionVersion: true },
  });
  if (!employee || employee.status !== "active" || employee.tenantId !== session.tenantId || employee.sessionVersion !== (session.sessionVersion ?? 0)) return null;
  return { session: { ...session, role: employee.role }, mustChangePassword: employee.mustChangePassword };
}

/** Password setup needs the current identity before the portal is available. */
export async function getSession(): Promise<SessionPayload | null> {
  return (await readActiveIdentity())?.session ?? null;
}

export async function requireSession(): Promise<SessionPayload> {
  return requireActiveSession();
}

export async function requireActiveSession(): Promise<SessionPayload> {
  const identity = await readActiveIdentity();
  if (!identity || identity.mustChangePassword) throw new Error("unauthorized");
  return identity.session;
}

/**
 * Branch scope for branch-wise logins.
 * - Non-branch_manager roles (e.g. admin) are unscoped: branchId/branchName null.
 * - branch_manager is scoped to their employee.branchId (+ branch name);
 *   missing assignment → unauthorized.
 */
export async function requireBranchScope(): Promise<{
  session: SessionPayload;
  branchId: string | null;
  branchName: string | null;
}> {
  const session = await requireActiveSession();
  if (session.role !== "branch_manager") {
    return { session, branchId: null, branchName: null };
  }
  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    select: { branchId: true, branch: { select: { name: true } } },
  });
  if (!employee?.branchId) {
    throw new Error("unauthorized");
  }
  return { session, branchId: employee.branchId, branchName: employee.branch?.name ?? null };
}
