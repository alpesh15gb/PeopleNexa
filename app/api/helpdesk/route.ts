import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { recordApiPaging, recordPagination } from "@/lib/document-expense-pagination";
import type { Prisma } from "@/generated/prisma/client";
import { dispatchWebhook } from "@/lib/webhooks";

const CATEGORIES = ["general", "payroll", "attendance", "device", "it", "other"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

/** POST — any employee raises a ticket. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) ?? {};
  const subject = String(body.subject ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = CATEGORIES.includes(body.category) ? body.category : "general";
  const priority = PRIORITIES.includes(body.priority) ? body.priority : "medium";

  if (!subject || subject.length > 200) return NextResponse.json({ error: "Enter a subject up to 200 characters." }, { status: 400 });
  if (!description || description.length > 10000) return NextResponse.json({ error: "Enter a description up to 10,000 characters." }, { status: 400 });

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
  await dispatchWebhook(session.tenantId, "ticket.created", {
    ticketId: ticket.id,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
  });

  return NextResponse.json({ ticket }, { status: 201 });
}

/** GET — role-aware ticket list with messages. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const paging = recordApiPaging(params, 100);
  if (!paging) return NextResponse.json({ error: "Invalid ticket page." }, { status: 400 });
  const managing = params.get("view") !== "personal" && (session.role === "admin" || session.role === "location_manager");
  const locationId = managing ? await managerLocationId(session) : null;
  if (managing && session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const tenantId = session.tenantId;
  const scope: Prisma.TicketWhereInput = managing
    ? { tenantId, ...(locationId ? { requester: employeeLocationScope(locationId) } : {}) }
    : { tenantId, OR: [{ requesterId: session.sub }, { assigneeId: session.sub }] };
  const openStatuses = ["open", "in_progress"];
  const resolvedStatuses = ["resolved", "closed"];
  const filter = params.get("filter");
  const where = filter === "open" ? { ...scope, status: { in: openStatuses } } :
    filter === "resolved" ? { ...scope, status: { in: resolvedStatuses } } : scope;
  const { tickets, employees, summary, pagination } = await prisma.$transaction(async (tx) => {
    const totals = await tx.ticket.groupBy({ by: ["status", "priority"], where: scope, _count: { _all: true } });
    const summary = {
      open: totals.filter((row) => openStatuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0),
      resolved: totals.filter((row) => resolvedStatuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0),
      urgent: totals.filter((row) => row.priority === "urgent" && openStatuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0),
    };
    const total = filter === "open" ? summary.open : filter === "resolved" ? summary.resolved : totals.reduce((sum, row) => sum + row._count._all, 0);
    const pagination = recordPagination(total, paging.page, paging.pageSize);
    const tickets = await tx.ticket.findMany({
      where,
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        messages: { include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: pagination.offset,
      take: pagination.pageSize,
    });
    const employees = managing
      ? await tx.employee.findMany({
          where: { tenantId: session.tenantId, status: "active", ...(locationId ? employeeLocationScope(locationId) : {}) },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          orderBy: { employeeNumber: "asc" },
        })
      : [];
    return { tickets, employees, summary, pagination };
  }, { isolationLevel: "RepeatableRead" });

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
      isRequester: t.requesterId === session.sub,
      messages: t.messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString() })),
    })),
    employees,
    summary,
    pagination,
  });
}
