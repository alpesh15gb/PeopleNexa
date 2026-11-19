import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee, notifyAdmins } from "@/lib/notifications";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import type { Prisma } from "@/generated/prisma/client";

const STATUSES = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

/** PATCH — admin: status/assignee/priority; anyone involved: add a message. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) ?? {};
  const action = body.action;
  if (action !== undefined && action !== "message" && action !== "update") {
    return NextResponse.json({ error: "Invalid ticket action." }, { status: 400 });
  }
  const locationId = await managerLocationId(session);
  const canManage = session.role === "admin" || (session.role === "location_manager" && Boolean(locationId));
  const manageScope = locationId ? { requester: employeeLocationScope(locationId) } : {};
  const participantScope = [{ requesterId: session.sub }, { assigneeId: session.sub }];
  if (action !== "message" && !canManage) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const where: Prisma.TicketWhereInput = {
    id,
    tenantId: session.tenantId,
    ...(action === "message" && session.role !== "admin"
      ? { OR: locationId ? [...participantScope, manageScope] : participantScope }
      : manageScope),
  };
  const ticket = await prisma.ticket.findFirst({ where });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (action === "message") {
    const text = String(body.body ?? "").trim();
    if (!text || text.length > 10000) return NextResponse.json({ error: "Enter a message up to 10,000 characters." }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const [changed] = await tx.ticket.updateManyAndReturn({
        where: { ...where, status: { not: "closed" } },
        data: { updatedAt: new Date() },
        select: { requesterId: true, assigneeId: true, subject: true },
      });
      if (!changed) return null;
      const message = await tx.ticketMessage.create({ data: { ticketId: id, senderId: session.sub, body: text } });
      return { changed, message };
    });
    if (!result) return NextResponse.json({ error: "This ticket is closed or has changed. Refresh before replying." }, { status: 409 });
    const { changed, message } = result;
    const recipients = new Set([changed.requesterId, changed.assigneeId]);
    recipients.delete(session.sub);
    for (const employeeId of recipients) {
      if (employeeId) await notifyEmployee(ticket.tenantId, employeeId, "info", "Reply on a support ticket", changed.subject);
    }
    if (!changed.assigneeId && changed.requesterId === session.sub && session.role !== "admin") {
      await notifyAdmins(ticket.tenantId, "info", "New reply on ticket", changed.subject);
    }
    return NextResponse.json({ message }, { status: 201 });
  }

  const data: Prisma.TicketUncheckedUpdateManyInput = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    if (body.status !== ticket.status) {
      data.status = body.status;
      data.resolvedAt = body.status === "resolved" || body.status === "closed" ? ticket.resolvedAt ?? new Date() : null;
    }
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
    data.priority = body.priority;
  }
  if (body.assigneeId !== undefined) {
    const raw = body.assigneeId ? String(body.assigneeId) : "";
    if (!raw) {
      data.assigneeId = null;
    } else {
      const assignee = await prisma.employee.findFirst({
        where: { id: raw, tenantId: session.tenantId, status: "active", ...(locationId ? employeeLocationScope(locationId) : {}) },
        select: { id: true },
      });
      if (!assignee) return NextResponse.json({ error: "Invalid assignee." }, { status: 400 });
      data.assigneeId = raw;
    }
  }

  const [updated] = Object.keys(data).length ? await prisma.ticket.updateManyAndReturn({
    where: { ...where, ...(data.status ? { status: ticket.status } : {}), ...(data.assigneeId !== undefined ? { assigneeId: ticket.assigneeId } : {}) },
    data,
  }) : [ticket];
  if (!updated) return NextResponse.json({ error: "This ticket changed. Refresh and try again." }, { status: 409 });
  if (data.status) {
    await notifyEmployee(ticket.tenantId, ticket.requesterId, body.status === "resolved" ? "success" : "info", `Ticket ${body.status}`, ticket.subject);
  }
  if (updated.assigneeId && updated.assigneeId !== ticket.assigneeId && updated.assigneeId !== session.sub) {
    await notifyEmployee(ticket.tenantId, updated.assigneeId, "info", "Support ticket assigned to you", ticket.subject);
  }
  return NextResponse.json({ ticket: updated });
}

/** DELETE — admin removes a ticket. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  await prisma.ticket.deleteMany({ where: { id, tenantId: session.tenantId, ...(locationId ? { requester: employeeLocationScope(locationId) } : {}) } });
  return NextResponse.json({ success: true });
}
