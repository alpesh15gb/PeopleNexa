import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { hasStaffPortalLogin } from "@/lib/branch-manager";

const conflict = "Branch managers changed. Close this form and reopen it before saving.";

function validId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value) && value.length <= 128;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Only a workspace admin can change branch manager access." }, { status: 403 });
  const { id: branchId } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Choose the current manager and the replacement." }, { status: 400 });
  }
  const { currentManagerId, employeeId, expectedManagerIds } = body;
  if ((currentManagerId !== null && !validId(currentManagerId)) || (employeeId !== null && !validId(employeeId)) ||
    !Array.isArray(expectedManagerIds) || !expectedManagerIds.every(validId) ||
    new Set(expectedManagerIds).size !== expectedManagerIds.length ||
    (!currentManagerId && !employeeId) || currentManagerId && !expectedManagerIds.includes(currentManagerId)) {
    return NextResponse.json({ error: "Choose the current manager and the replacement." }, { status: 400 });
  }
  const tenantId = session.tenantId;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await tx.employee.findFirst({
        where: { tenantId, id: session.sub, role: "admin", status: "active", sessionVersion: session.sessionVersion ?? 0 },
        select: { id: true },
      });
      if (!actor) return { error: "Only a workspace admin can change branch manager access.", status: 403 };
      const branch = await tx.branch.findFirst({ where: { id: branchId, tenantId }, select: { name: true } });
      if (!branch) return { error: "Branch not found.", status: 404 };

      const staffScope = { tenantId, branchId, status: "active", loginOnly: false };
      const managers = await tx.employee.findMany({
        where: { ...staffScope, role: "branch_manager" },
        select: { id: true, updatedAt: true },
      });
      const managerIds = new Set(managers.map(({ id }) => id));
      if (managers.length !== expectedManagerIds.length || !expectedManagerIds.every((id: string) => managerIds.has(id)) ||
        (!currentManagerId && managers.length)) return { error: conflict, status: 409 };
      if (currentManagerId && currentManagerId === employeeId) return { managerIds: [...managerIds] };
      if (employeeId === session.sub || currentManagerId === session.sub) {
        return { error: "You cannot change your own role.", status: 400 };
      }

      const incoming = employeeId ? await tx.employee.findFirst({
        where: { ...staffScope, id: employeeId, role: { in: ["employee", "supervisor"] } },
        select: { id: true, updatedAt: true, role: true, email: true, password: true },
      }) : null;
      if (employeeId && (!incoming || !hasStaffPortalLogin(incoming))) {
        return { error: "Choose an active employee in this branch with a portal login.", status: 400 };
      }
      const outgoing = managers.find(({ id }) => id === currentManagerId);

      if (outgoing) await tx.employee.update({
        where: { ...staffScope, id: outgoing.id, role: "branch_manager", updatedAt: outgoing.updatedAt },
        data: { role: "employee", sessionVersion: { increment: 1 } },
      });
      if (incoming) await tx.employee.update({
        where: { ...staffScope, id: incoming.id, role: incoming.role, updatedAt: incoming.updatedAt },
        data: { role: "branch_manager", sessionVersion: { increment: 1 } },
      });

      const after = managers.filter(({ id }) => id !== currentManagerId).map(({ id }) => id);
      if (incoming) after.push(incoming.id);
      await tx.auditLog.create({
        data: {
          tenantId, actorId: session.sub, actorRole: session.role,
          action: "branch.manager.change", entity: "Branch", entityId: branchId,
          summary: `Updated staff manager access for ${branch.name}`,
          before: { managerIds: [...managerIds], ...(incoming ? { incomingRole: incoming.role } : {}) },
          after: { managerIds: after, outgoingEmployeeId: outgoing?.id ?? null, incomingEmployeeId: incoming?.id ?? null },
        },
      });
      return { managerIds: after };
    }, { isolationLevel: "Serializable" });
    return "error" in result
      ? NextResponse.json({ error: result.error }, { status: result.status })
      : NextResponse.json(result);
  } catch (error) {
    if (["P2034", "P2025"].includes((error as { code?: string }).code ?? "")) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }
    throw error;
  }
}
