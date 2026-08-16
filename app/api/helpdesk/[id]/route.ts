import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee, notifyAdmins } from "@/lib/notifications";

const STATUSES = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

/** PATCH — admin: status/assignee/priority; anyone involved: add a message. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const ticket = await prisma.ticket.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (action === "message") {
    const text = String(body.body ?? "").trim();
    if (!text) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    const msg = await prisma.ticketMessage.create({
      data: { ticketId: id, senderId: session.sub, body: text },
    });
    await prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
    // Notify the other party.
    if (session.role === "admin") {
      await notifyEmployee(ticket.tenantId, ticket.requesterId, "info", "Reply on your ticket", ticket.subject);
    } else {
      await notifyAdmins(ticket.tenantId, "info", "New reply on ticket", ticket.subject);
    }
    return NextResponse.json({ message: msg }, { status: 201 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    data.status = body.status;
    if (body.status === "resolved" || body.status === "closed") data.resolvedAt = new Date();
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
    data.priority = body.priority;
  }
  if (body.assigneeId !== undefined) {
    data.assigneeId = body.assigneeId || null;
  }

  const updated = await prisma.ticket.update({ where: { id }, data });
  if (body.status && body.status !== ticket.status) {
    await notifyEmployee(ticket.tenantId, ticket.requesterId, body.status === "resolved" ? "success" : "info", `Ticket ${body.status}`, ticket.subject);
  }
  return NextResponse.json({ ticket: updated });
}

/** DELETE — admin removes a ticket. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.ticket.deleteMany({ where: { id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
