import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  attendanceSummary,
  computePayroll,
  fyFromMonth,
  getPayrollConfig,
  payrollEmployeeForMonth,
  loanDeductionForMonth,
} from "@/lib/payroll";
import { appendAudit } from "@/lib/audit";

/** POST — recompute a single payslip from fresh attendance/adjustments/config (admin). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const existing = await prisma.payslip.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "paid") {
    return NextResponse.json({ error: "Paid payslips cannot be regenerated." }, { status: 409 });
  }

  const [tenant, employee] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    prisma.employee.findFirst({
      where: { id: existing.employeeId, tenantId: session.tenantId },
      select: { id: true, salary: true, salaryStructure: true, payMode: true, workBasisRate: true, shiftId: true, joiningDate: true },
    }),
  ]);
  if (!employee || employee.salary == null) {
    return NextResponse.json({ error: "Employee salary not found." }, { status: 400 });
  }

  const config = getPayrollConfig(tenant?.config ?? null);
  const summary = await attendanceSummary(
    session.tenantId,
    { id: employee.id, shiftId: employee.shiftId, joiningDate: employee.joiningDate },
    existing.month
  );
  const [loans, adjustments, taxDecl] = await Promise.all([
    prisma.employeeLoan.findMany({
      where: { tenantId: session.tenantId, employeeId: employee.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, startMonth: true, lastDeductedMonth: true, outstanding: true, emiAmount: true, amount: true },
    }),
    prisma.payrollAdjustment.findMany({
      where: { tenantId: session.tenantId, employeeId: employee.id, month: existing.month },
      select: { id: true, type: true, label: true, amount: true },
    }),
    prisma.taxDeclaration.findUnique({
      where: { employeeId_fy: { employeeId: employee.id, fy: fyFromMonth(existing.month) } },
      select: { sections: true, status: true },
    }),
  ]);
  const decl = (taxDecl?.sections ?? {}) as Record<string, number>;
  const investments = taxDecl?.status === "verified" ? Number(decl.total ?? 0) || 0 : 0;

  // Roll back the prior month's allocation in memory first. Regeneration can
  // reduce the loan cap, so the old deduction must be returned before the new
  // allocation is calculated and persisted in the same transaction.
  let restoreRemaining = Math.max(0, Number(existing.loanDeduction));
  const restoredLoans = loans.map((loan) => {
    if (loan.lastDeductedMonth !== existing.month || restoreRemaining <= 0) return loan;
    const restore = Math.min(
      restoreRemaining,
      loan.emiAmount > 0 ? loan.emiAmount : restoreRemaining
    );
    restoreRemaining -= restore;
    return {
      ...loan,
      outstanding: loan.outstanding + restore,
      lastDeductedMonth: null,
      status: "active",
    };
  });
  const restoredLoanTotal = Number(existing.loanDeduction) - restoreRemaining;
  const { total: loanDeduction } = loanDeductionForMonth(restoredLoans, existing.month);
  const result = computePayroll(
    config,
    payrollEmployeeForMonth({
      salary: employee.salary,
      salaryStructure: employee.salaryStructure,
      payMode: employee.payMode,
      workBasisRate: employee.workBasisRate,
      joiningDate: employee.joiningDate,
    }, existing.month),
    summary,
    loanDeduction,
    existing.month,
    adjustments,
    investments
  );

  const iso = new Date().toISOString();
  const updated = await prisma.$transaction(async (tx) => {
    for (const loan of loans) {
      const restored = restoredLoans.find((candidate) => candidate.id === loan.id);
      if (restored && restored.outstanding !== loan.outstanding) {
        await tx.employeeLoan.update({
          where: { id: loan.id },
          data: { outstanding: restored.outstanding, lastDeductedMonth: null, status: "active" },
        });
      }
    }
    const updated = await tx.payslip.update({
      where: { id },
      data: {
      baseSalary: result.baseSalary,
      basicSalary: result.basic,
      allowances: result.allowances,
      overtimePay: result.overtimePay,
      grossEarnings: result.grossEarnings,
      gratuity: result.gratuity,
      pfEmployee: result.pfEmployee,
      pfEmployer: result.pfEmployer,
      esicEmployee: result.esicEmployee,
      esicEmployer: result.esicEmployer,
      professionalTax: result.professionalTax,
      lwf: result.lwf,
      tds: result.tds,
      lateFines: result.lateFines,
      loanDeduction: result.loanDeduction,
      absentDeduction: result.absentDeduction,
      workingDays: result.workingDays,
      divisorUsed: result.divisorUsed,
      onLeaveDays: result.onLeaveDays,
      deductions: result.deductions,
      netSalary: result.netSalary,
      adjustments: result.adjustments as unknown as Prisma.InputJsonValue,
      presentDays: result.presentDays,
      lateDays: result.lateDays,
      halfDays: result.halfDays,
      absentDays: result.absentDays,
      overtimeHours: result.overtimeHours,
      workedHours: result.workedHours,
        note: existing.note ? `${existing.note} | regenerated ${iso}` : `regenerated ${iso}`,
      },
    });
    const allocations = loanDeductionForMonth(restoredLoans, existing.month, result.loanDeduction).updates;
    for (const loan of allocations) {
      await tx.employeeLoan.update({
        where: { id: loan.id },
        data: { outstanding: loan.newOutstanding, lastDeductedMonth: loan.lastDeductedMonth, status: loan.close ? "closed" : "active" },
      });
    }
    return updated;
  });

  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "payslip.regenerate",
    entity: "Payslip",
    entityId: id,
    summary: `Regenerated ${existing.month} net ${Number(existing.netSalary)} -> ${Number(updated.netSalary)}; loan restored ${restoredLoanTotal}`,
    before: { netSalary: Number(existing.netSalary) },
    after: { netSalary: Number(updated.netSalary) },
  });

  return NextResponse.json({ payslip: updated });
}
