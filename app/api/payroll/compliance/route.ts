import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";
import { fyFromMonth } from "@/lib/payroll";

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");

const pad = (n: number) => String(n).padStart(2, "0");

/** The three month keys of the quarter containing `month` (FY quarters). */
function quarterMonths(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const q = Math.floor((((m + 8) % 12) / 3) + 1); // Apr=Q1 … Mar=Q4
  const startM = [4, 7, 10, 1][q - 1];
  const startY = q === 4 ? y + 1 : y; // Q4 spans Jan–Mar of the next calendar year
  return [0, 1, 2].map((i) => `${startY}-${pad(startM + i)}`);
}

/** GET /api/payroll/compliance?type=ecr|form16|form24q&month=2026-08 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = String(req.nextUrl.searchParams.get("type") ?? "ecr");
  const month = req.nextUrl.searchParams.get("month") || monthKey(new Date());
  const fy = fyFromMonth(month);

  if (type === "ecr") {
    const payslips = await prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month },
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true, uan: true, joiningDate: true } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    });
    const rows: (string | number)[][] = [
      ["S.No", "Member ID", "Member Name", "UAN", "Date of Joining", "EPF Wages (Basic)", "EE EPF (12%)", "ER EPF (3.67%)", "ER EPS (8.33%)"],
      ...payslips.map((p, i) => {
        const wages = p.baseSalary; // basic is the PF wage base
        return [
          i + 1,
          p.employee.employeeNumber,
          `${p.employee.firstName} ${p.employee.lastName}`.trim(),
          p.employee.uan ?? "",
          p.employee.joiningDate ? p.employee.joiningDate.toISOString().slice(0, 10) : "",
          wages.toFixed(2),
          (wages * 0.12).toFixed(2),
          (wages * 0.0367).toFixed(2),
          (wages * 0.0833).toFixed(2),
        ];
      }),
    ];
    const res = new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pf-ecr-${month}.csv"`,
      },
    });
    return res;
  }

  if (type === "form16") {
    const payslips = await prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month: { startsWith: fy.slice(0, 4) } },
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, pan: true } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    });
    const byEmp = new Map<string, { emp: (typeof payslips)[number]["employee"]; gross: number; tds: number; pf: number; months: number }>();
    for (const p of payslips) {
      const cur = byEmp.get(p.employee.id) ?? { emp: p.employee, gross: 0, tds: 0, pf: 0, months: 0 };
      cur.gross += p.grossEarnings;
      cur.tds += p.tds;
      cur.pf += p.pfEmployee;
      cur.months++;
      byEmp.set(p.employee.id, cur);
    }
    const rows: (string | number)[][] = [
      ["Employee Name", "Employee Code", "PAN", "Gross Salary", "Months Paid", "Total TDS (Section 192)", "Total PF Deducted", "Net Salary (est.)"],
      ...[...byEmp.values()].map(({ emp, gross, tds, pf, months }) => [
        `${emp.firstName} ${emp.lastName}`.trim(),
        emp.employeeNumber,
        emp.pan ?? "",
        gross.toFixed(2),
        months,
        tds.toFixed(2),
        pf.toFixed(2),
        (gross - tds - pf).toFixed(2),
      ]),
    ];
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="form16-${fy}.csv"`,
      },
    });
  }

  if (type === "form24q") {
    const months = quarterMonths(month);
    const payslips = await prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month: { in: months } },
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, pan: true } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    });
    const byEmp = new Map<string, { emp: (typeof payslips)[number]["employee"]; tds: number; salary: number }>();
    for (const p of payslips) {
      const cur = byEmp.get(p.employee.id) ?? { emp: p.employee, tds: 0, salary: 0 };
      cur.tds += p.tds;
      cur.salary += p.grossEarnings;
      byEmp.set(p.employee.id, cur);
    }
    const rows: (string | number)[][] = [
      ["Employee Name", "Employee Code", "PAN", `Salary Paid (${months.join(", ")})`, `TDS Deducted (${months.join(", ")})`],
      ...[...byEmp.values()].map(({ emp, tds, salary }) => [
        `${emp.firstName} ${emp.lastName}`.trim(),
        emp.employeeNumber,
        emp.pan ?? "",
        salary.toFixed(2),
        tds.toFixed(2),
      ]),
    ];
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="form24q-${month}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
}
