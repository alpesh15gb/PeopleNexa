import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKeyIST } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") || monthKeyIST(new Date());
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }

  // Optional payout-status filter (PagarBook parity). `unpaid` is an alias for `draft`
  // since the stored statuses are only draft | paid.
  const statusParam = (req.nextUrl.searchParams.get("status") || "").toLowerCase();
  if (statusParam && !["paid", "draft", "unpaid"].includes(statusParam)) {
    return NextResponse.json({ error: "status must be one of: paid, draft, unpaid." }, { status: 400 });
  }
  const payslipStatusFilter =
    statusParam === "paid" ? "paid" : statusParam === "draft" || statusParam === "unpaid" ? "draft" : undefined;

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
      where: {
        tenantId: session.tenantId,
        month,
        ...(payslipStatusFilter ? { status: payslipStatusFilter } : {}),
      },
      // paidVia / paidAt / paymentRef are scalar fields so they are auto-included here.
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
