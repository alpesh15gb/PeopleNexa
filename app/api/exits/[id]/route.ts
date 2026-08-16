import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeFandF } from "@/lib/exit";
import { notifyAdmins, notifyEmployee } from "@/lib/notifications";
import { getPayrollConfig, splitSalary } from "@/lib/payroll";
import { sendWhatsApp } from "@/lib/whatsapp";

/** PATCH — { action: "approve" | "reject" | "complete" | "cancel", note? } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const note = body.note ? String(body.note) : null;

  const request = await prisma.exitRequest.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, salary: true, salaryStructure: true, phone: true } },
    },
  });
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const isAdmin = session.role === "admin";
  if (action === "approve" || action === "reject" || action === "complete") {
    if (!isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (action === "cancel") {
    if (request.employeeId !== session.sub && !isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (request.status === "completed") return NextResponse.json({ error: "Already completed." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  if (action === "approve") {
    // Compute full & final settlement.
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
    const config = getPayrollConfig(tenant?.config);
    const { basic } = splitSalary(request.employee.salary ?? 0, request.employee.salaryStructure, config);
    const grossMonthly = Math.round((request.employee.salary ?? 0) + basic * 0.12); // salary + HRA-ish allowance
    const loans = await prisma.employeeLoan.aggregate({
      where: { tenantId: session.tenantId, employeeId: request.employee.id, status: "active" },
      _sum: { outstanding: true },
    });
    const noticeDays = 30;

    // Encashable leave balance: remaining days of leave types flagged encashable.
    const [leaveTypes, leaveRequests] = await Promise.all([
      prisma.leaveType.findMany({ where: { tenantId: session.tenantId, encashable: true } }),
      prisma.leaveRequest.findMany({
        where: { tenantId: session.tenantId, employeeId: request.employee.id, status: { in: ["approved", "pending"] } },
        select: { leaveTypeId: true, days: true },
      }),
    ]);
    const usedByType = new Map<string, number>();
    for (const r of leaveRequests) usedByType.set(r.leaveTypeId, (usedByType.get(r.leaveTypeId) ?? 0) + r.days);
    const encashableDays = leaveTypes.reduce(
      (sum, t) => sum + Math.max(t.maxDays - (usedByType.get(t.id) ?? 0), 0),
      0
    );

    const fAndF = computeFandF({
      grossMonthly,
      resignationDate: request.resignationDate,
      lastWorkingDay: request.lastWorkingDay,
      noticeDays,
      loanOutstanding: loans._sum.outstanding ?? 0,
      encashmentDays: encashableDays,
    });

    const updated = await prisma.exitRequest.update({
      where: { id },
      data: { status: "approved", note, reviewedBy: session.sub, reviewedAt: new Date(), fAndF: JSON.parse(JSON.stringify(fAndF)) },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await notifyEmployee(
      session.tenantId,
      request.employeeId,
      "success",
      "Resignation approved",
      `Your last working day is ${request.lastWorkingDay.toISOString().slice(0, 10)}. Final settlement: ₹${fAndF.finalAmount.toLocaleString("en-IN")}.`
    );
    await sendWhatsApp(session.tenantId, request.employee.phone ?? null, "exit.approved", {
      lwd: request.lastWorkingDay.toISOString().slice(0, 10),
      amount: fAndF.finalAmount.toFixed(0),
    });
    return NextResponse.json({ request: updated, fAndF });
  }

  if (action === "reject") {
    const updated = await prisma.exitRequest.update({
      where: { id },
      data: { status: "rejected", note, reviewedBy: session.sub, reviewedAt: new Date() },
    });
    await notifyEmployee(
      session.tenantId,
      request.employeeId,
      "info",
      "Resignation not accepted",
      note ? `Note from HR: ${note}` : "Your exit request was not approved. Contact HR."
    );
    return NextResponse.json({ request: updated });
  }

  if (action === "complete") {
    const updated = await prisma.exitRequest.update({
      where: { id },
      data: { status: "completed", note, reviewedBy: session.sub, reviewedAt: new Date() },
    });
    await prisma.employee.update({ where: { id: request.employeeId }, data: { status: "inactive" } });
    await notifyAdmins(
      session.tenantId,
      "info",
      "Employee offboarded",
      `${request.employee.firstName} ${request.employee.lastName} is now marked inactive.`
    );
    return NextResponse.json({ request: updated });
  }

  // cancel
  const updated = await prisma.exitRequest.update({
    where: { id },
    data: { status: "cancelled", note },
  });
  await notifyAdmins(
    session.tenantId,
    "info",
    "Exit request cancelled",
    `${request.employee.firstName} ${request.employee.lastName} cancelled their exit request.`
  );
  return NextResponse.json({ request: updated });
}
