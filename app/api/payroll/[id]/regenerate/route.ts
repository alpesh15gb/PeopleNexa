import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  attendanceSummary,
  computePayroll,
  fyFromMonth,
  getPayrollConfig,
} from "@/lib/payroll";

/** POST — recompute a single payslip from fresh attendance/adjustments/config (admin). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const existing = await prisma.payslip.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

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
  const [adjustments, taxDecl] = await Promise.all([
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

  // Preserve the already-applied loan deduction: re-deriving it from loans
  // would see lastDeductedMonth >= month and return 0, wiping the deduction.
  const result = computePayroll(
    config,
    {
      salary: employee.salary,
      salaryStructure: employee.salaryStructure,
      payMode: employee.payMode,
      workBasisRate: employee.workBasisRate,
    },
    summary,
    existing.loanDeduction,
    existing.month,
    adjustments,
    investments
  );

  const iso = new Date().toISOString();
  const updated = await prisma.payslip.update({
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

  return NextResponse.json({ payslip: updated });
}
