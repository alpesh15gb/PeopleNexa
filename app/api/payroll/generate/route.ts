import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { generatePayslipForEmployee } from "@/lib/payroll";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const month = String(body.month ?? monthKeyIST());
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "active" },
    select: { id: true, salary: true, salaryStructure: true, payMode: true, workBasisRate: true, shiftId: true, joiningDate: true, phone: true },
  });

  const withSalary = employees
    .filter((e) => e.salary != null && e.salary > 0)
    .map((e) => ({
      id: e.id,
      salary: e.salary!,
      salaryStructure: e.salaryStructure,
      payMode: e.payMode,
      workBasisRate: e.workBasisRate,
      shiftId: e.shiftId,
      joiningDate: e.joiningDate,
    }));
  let created = 0;
  let totalLoanApplied = 0;

  const phones = new Map(
    employees.map((e) => [e.id, e.phone ?? null] as const)
  );

  type GenResult = { employeeId: string; created: boolean; netSalary?: number; error?: string };
  const results: GenResult[] = [];

  for (const emp of withSalary) {
    try {
      const res = await generatePayslipForEmployee(session.tenantId, tenant?.config ?? null, emp, month);
      if (res.created) created++;
      totalLoanApplied += res.loanApplied ?? 0;
      results.push({ employeeId: emp.id, created: res.created, ...(res.netSalary != null ? { netSalary: res.netSalary } : {}) });
    } catch (e) {
      results.push({ employeeId: emp.id, created: false, error: e instanceof Error ? e.message : "Failed to generate" });
    }
  }

  // Notify outside the generation loop so a WhatsApp failure never fails the response.
  const notifyTargets = results.filter((r) => r.created && r.netSalary != null);
  await Promise.allSettled(
    notifyTargets.map((r) =>
      sendWhatsApp(session.tenantId, phones.get(r.employeeId), "payslip.generated", {
        month,
        amount: Number(r.netSalary).toFixed(0),
      })
    )
  );

  const failed = results.filter((r) => r.error).length;
  return NextResponse.json({
    success: true,
    month,
    created,
    skipped: employees.length - withSalary.length,
    loanApplied: totalLoanApplied,
    results,
    totals: { created, skipped: employees.length - withSalary.length, failed, total: employees.length },
  });
}
