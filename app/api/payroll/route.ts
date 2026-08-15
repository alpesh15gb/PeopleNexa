import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") || monthKey(new Date());

  const [employees, payslips] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        salary: true,
        accountNumber: true,
        ifscCode: true,
        bankName: true,
        department: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const slipByEmp = new Map(payslips.map((p) => [p.employee.id, p]));

  const rows = employees.map((emp) => ({
    employee: emp,
    payslip: slipByEmp.get(emp.id) ?? null,
  }));

  const totals = payslips.reduce(
    (acc, p) => {
      acc.gross += p.grossEarnings;
      acc.deductions += p.deductions;
      acc.net += p.netSalary;
      acc.paid += p.status === "paid" ? 1 : 0;
      return acc;
    },
    { gross: 0, deductions: 0, net: 0, paid: 0 }
  );

  return NextResponse.json({ month, rows, totals, generated: payslips.length });
}
