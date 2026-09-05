import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";

const CATEGORIES = ["general", "payroll", "attendance", "device", "it", "other"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

/** POST — any employee raises a ticket. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = CATEGORIES.includes(body.category) ? body.category : "general";
  const priority = PRIORITIES.includes(body.priority) ? body.priority : "medium";

  if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Describe the issue." }, { status: 400 });

  const ticket = await prisma.ticket.create({
    data: {
      tenantId: session.tenantId,
      requesterId: session.sub,
      subject,
      description,
      category,
      priority,
    },
  });

  await notifyAdmins(
    session.tenantId,
    "info",
    "New support ticket",
    `${subject} (${category}, ${priority})`
  );

  return NextResponse.json({ ticket }, { status: 201 });
}

/** GET — role-aware ticket list with messages. */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const where = session.role === "admin" ? { tenantId: session.tenantId } : { requesterId: session.sub };
  const [tickets, employees] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        messages: { include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    session.role === "admin"
      ? prisma.employee.findMany({
          where: { tenantId: session.tenantId, status: "active" },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          orderBy: { employeeNumber: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const summary = {
    open: tickets.filter((t) => t.status === "open" || t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
    urgent: tickets.filter((t) => t.priority === "urgent" && t.status !== "closed").length,
  };

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      description: t.description,
      category: t.category,
      priority: t.priority,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      requester: t.requester,
      assignee: t.assignee,
      messages: t.messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString() })),
    })),
    employees,
    summary,
  });
}
