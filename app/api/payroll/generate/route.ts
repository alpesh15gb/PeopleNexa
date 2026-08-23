import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";
import { generatePayslipForEmployee, monthRange } from "@/lib/payroll";
import { finalizeEligibleDays } from "@/lib/reconcile";
import { sendWhatsApp } from "@/lib/whatsapp";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const month = String(body.month ?? monthKey(new Date()));
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "Invalid payroll month." }, { status: 400 });
  }
  const { start, end } = monthRange(month);
  if (end.getTime() > Date.now()) {
    return NextResponse.json(
      { error: "Payroll can be generated only after the selected month has fully closed in IST." },
      { status: 409 }
    );
  }

  // Close every eligible attendance row before preflight. Payroll only consumes
  // a closed month and is blocked if any attendance/leave decision is mutable.
  await finalizeEligibleDays(session.tenantId, 5000);

  const [tenant, employees, openAttendance, pendingCorrections, pendingLeaves] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    prisma.employee.findMany({
      where: {
        tenantId: session.tenantId,
        salary: { gt: 0 },
        OR: [{ joiningDate: null }, { joiningDate: { lt: end } }],
        AND: [
          {
            OR: [
              { status: "active" },
              {
                exitRequests: {
                  some: {
                    status: { in: ["approved", "completed"] },
                    lastWorkingDay: { gte: start },
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        salary: true,
        salaryStructure: true,
        payMode: true,
        workBasisRate: true,
        shiftId: true,
        joiningDate: true,
        phone: true,
      },
    }),
    prisma.attendance.findMany({
      where: {
        tenantId: session.tenantId,
        date: { gte: start, lt: end },
        OR: [{ finalized: false }, { reviewStatus: { not: null } }],
      },
      select: { id: true, employeeId: true, date: true, finalized: true, reviewStatus: true },
      take: 25,
    }),
    prisma.punchCorrection.findMany({
      where: { tenantId: session.tenantId, status: "pending", date: { gte: start, lt: end } },
      select: { id: true },
      take: 25,
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "pending",
        fromDate: { lt: end },
        toDate: { gte: start },
      },
      select: { id: true },
      take: 25,
    }),
  ]);

  if (!tenant) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (openAttendance.length || pendingCorrections.length || pendingLeaves.length) {
    return NextResponse.json(
      {
        error: "Payroll preflight failed. Finalize attendance and resolve all pending regularizations/leaves for this month first.",
        blockers: {
          attendance: openAttendance.length,
          regularizations: pendingCorrections.length,
          leaves: pendingLeaves.length,
        },
      },
      { status: 409 }
    );
  }

  let created = 0;
  let existing = 0;
  let totalLoanApplied = 0;
  const failures: Array<{ employeeId: string; error: string }> = [];

  for (const emp of employees) {
    try {
      const res = await generatePayslipForEmployee(session.tenantId, tenant.config ?? null, emp, month);
      if (res.created) created++;
      else existing++;
      totalLoanApplied += res.loanApplied ?? 0;
      if (res.created && res.netSalary != null) {
        await sendWhatsApp(session.tenantId, emp.phone, "payslip.generated", {
          month,
          amount: res.netSalary.toFixed(0),
        });
      }
    } catch (err) {
      failures.push({ employeeId: emp.id, error: err instanceof Error ? err.message : "Payroll generation failed" });
    }
  }

  if (failures.length) {
    return NextResponse.json(
      { success: false, month, created, existing, failed: failures.length, failures: failures.slice(0, 20), loanApplied: totalLoanApplied },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    month,
    created,
    existing,
    eligibleEmployees: employees.length,
    loanApplied: totalLoanApplied,
  });
}
