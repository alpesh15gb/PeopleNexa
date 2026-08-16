import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";
import { generatePayslipForEmployee } from "@/lib/payroll";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const month = String(body.month ?? monthKey(new Date()));

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

  for (const emp of withSalary) {
    const res = await generatePayslipForEmployee(session.tenantId, tenant?.config ?? null, emp, month);
    if (res.created) created++;
    totalLoanApplied += res.loanApplied ?? 0;
    if (res.created && res.netSalary != null) {
      await sendWhatsApp(session.tenantId, phones.get(emp.id), "payslip.generated", {
        month,
        amount: res.netSalary.toFixed(0),
      });
    }
  }

  return NextResponse.json({
    success: true,
    month,
    created,
    skipped: employees.length - withSalary.length,
    loanApplied: totalLoanApplied,
  });
}
