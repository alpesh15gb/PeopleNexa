import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, toDateKey, daysBetween } from "@/lib/dates";
import { notifyAdmins, notifyEmployee } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const requests = await prisma.leaveRequest.findMany({
    where: {
      tenantId: session.tenantId,
      ...(session.role !== "admin" ? { employeeId: session.sub } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      leaveType: true,
    },
    orderBy: { appliedAt: "desc" },
  });
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { leaveTypeId, fromDate, toDate, reason } = body as Record<string, string>;
    if (!leaveTypeId || !fromDate || !toDate) {
      return NextResponse.json({ error: "Leave type and dates are required." }, { status: 400 });
    }

    const leaveType = await prisma.leaveType.findFirst({
      where: { id: leaveTypeId, tenantId: session.tenantId },
    });
    if (!leaveType) return NextResponse.json({ error: "Leave type not found." }, { status: 404 });

    // Admins may log leave on behalf of an employee; employees apply for themselves.
    let employeeId = session.sub;
    let onBehalf = false;
    if (body.employeeId && session.role === "admin") {
      const target = await prisma.employee.findFirst({
        where: { id: String(body.employeeId), tenantId: session.tenantId },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
      employeeId = target.id;
      onBehalf = true;
    }

    const from = fromDateKey(fromDate);
    const to = fromDateKey(toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Leave dates are invalid. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (to < from) return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
    const days = daysBetween(from, to);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      return NextResponse.json({ error: "Leave duration is invalid." }, { status: 400 });
    }

    // Inactive employees can't accrue new leave.
    const applicant = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId: session.tenantId },
      select: { id: true, status: true },
    });
    if (!applicant || applicant.status !== "active") {
      return NextResponse.json({ error: "Only active employees can request leave." }, { status: 403 });
    }

    // Balance check against approved + pending requests.
    const usedRows = await prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId,
        leaveTypeId,
        status: { in: ["approved", "pending"] },
      },
    });
    const usedDays = usedRows.reduce((sum, r) => sum + r.days, 0);
    if (usedDays + days > leaveType.maxDays) {
      return NextResponse.json(
        { error: `Insufficient balance — ${leaveType.maxDays - usedDays} day(s) remaining.` },
        { status: 400 }
      );
    }

    const request = await prisma.leaveRequest.create({
      data: {
        tenantId: session.tenantId,
        employeeId,
        leaveTypeId,
        fromDate: from,
        toDate: to,
        days,
        reason: reason || null,
        status: leaveType.requiresApproval ? "pending" : "approved",
      },
      include: { leaveType: true, employee: { select: { firstName: true, lastName: true } } },
    });

    // Notify admins about the new request (or the employee when auto-approved).
    if (onBehalf) {
      await notifyEmployee(
        session.tenantId,
        employeeId,
        "info",
        "Leave logged for you",
        `${request.leaveType.name} (${toDateKey(request.fromDate)} → ${toDateKey(request.toDate)}) was logged on your behalf by an admin.`
      );
    } else if (request.status === "pending") {
      await notifyAdmins(
        session.tenantId,
        "info",
        "New leave request",
        `${request.employee.firstName} ${request.employee.lastName} requested ${days} day(s) of ${request.leaveType.name}.`
      );
    } else {
      await notifyEmployee(
        session.tenantId,
        employeeId,
        "success",
        "Leave approved",
        `Your ${request.leaveType.name} (${toDateKey(request.fromDate)} → ${toDateKey(request.toDate)}) was auto-approved.`
      );
    }

    return NextResponse.json({ request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create leave request." }, { status: 500 });
  }
}
