import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";
import { fyFromMonth } from "@/lib/payroll";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
const pad = (n: number) => String(n).padStart(2, "0");

/** FY months Apr..Mar, e.g. 2026-27 => 2026-04 ... 2027-03. */
export function financialYearMonths(fy: string): string[] {
  const startYear = Number(fy.slice(0, 4));
  if (!Number.isInteger(startYear)) throw new Error("Invalid financial year.");
  return [
    ...Array.from({ length: 9 }, (_, i) => `${startYear}-${pad(i + 4)}`),
    ...Array.from({ length: 3 }, (_, i) => `${startYear + 1}-${pad(i + 1)}`),
  ];
}

/** Indian TDS quarter containing the given calendar month. */
export function quarterMonths(month: string): string[] {
  if (!MONTH_RE.test(month)) throw new Error("Invalid month.");
  const [y, m] = month.split("-").map(Number);
  const start = m >= 4 && m <= 6 ? 4 : m >= 7 && m <= 9 ? 7 : m >= 10 ? 10 : 1;
  return [0, 1, 2].map((i) => `${y}-${pad(start + i)}`);
}

function basicFromPayslip(p: { baseSalary: number; allowances: number }): number {
  // Since payroll hardening, baseSalary = payable contractual earnings and
  // allowances are the non-Basic remainder. This also provides a sane fallback
  // for records created before a dedicated Basic column exists.
  return Math.max(0, p.baseSalary - p.allowances);
}

function ensureFinalPayroll(rows: Array<{ status: string }>, period: string) {
  if (rows.some((p) => p.status !== "paid")) {
    throw new Error(`Compliance export for ${period} is blocked until every included payslip is marked paid.`);
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const type = String(req.nextUrl.searchParams.get("type") ?? "ecr");
  const month = req.nextUrl.searchParams.get("month") || monthKey(new Date());
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  const fy = fyFromMonth(month);

  try {
    if (type === "ecr") {
      const payslips = await prisma.payslip.findMany({
        where: { tenantId: session.tenantId, month },
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true, uan: true, joiningDate: true } } },
        orderBy: { employee: { employeeNumber: "asc" } },
      });
      ensureFinalPayroll(payslips, month);
      const missingUan = payslips.filter((p) => !p.employee.uan?.trim());
      if (missingUan.length) {
        return NextResponse.json({ error: `${missingUan.length} paid employee(s) are missing UAN. Complete statutory master data before ECR export.` }, { status: 409 });
      }

      const rows: (string | number)[][] = [
        ["S.No", "Member ID", "Member Name", "UAN", "Date of Joining", "Gross Wages", "EPF Wages", "EE EPF", "ER EPF", "ER EPS"],
        ...payslips.map((p, i) => {
          const basic = basicFromPayslip(p);
          const epfWages = Math.min(basic, 15000);
          const ee = Math.round(epfWages * 0.12);
          const eps = Math.round(epfWages * 0.0833);
          const erEpf = Math.max(0, ee - eps);
          return [
            i + 1,
            p.employee.employeeNumber,
            `${p.employee.firstName} ${p.employee.lastName}`.trim(),
            p.employee.uan ?? "",
            p.employee.joiningDate ? p.employee.joiningDate.toISOString().slice(0, 10) : "",
            p.grossEarnings.toFixed(2),
            epfWages.toFixed(2),
            ee.toFixed(2),
            erEpf.toFixed(2),
            eps.toFixed(2),
          ];
        }),
      ];
      return new NextResponse(csv(rows), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pf-contribution-register-${month}.csv"` },
      });
    }

    if (type === "form16") {
      const months = financialYearMonths(fy);
      const payslips = await prisma.payslip.findMany({
        where: { tenantId: session.tenantId, month: { in: months } },
        include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, pan: true } } },
        orderBy: { employee: { employeeNumber: "asc" } },
      });
      ensureFinalPayroll(payslips, fy);
      const missingPan = payslips.filter((p) => !p.employee.pan?.trim());
      if (missingPan.length) {
        return NextResponse.json({ error: `${new Set(missingPan.map((p) => p.employee.id)).size} paid employee(s) are missing PAN.` }, { status: 409 });
      }

      const byEmp = new Map<string, { emp: (typeof payslips)[number]["employee"]; gross: number; tds: number; pf: number; net: number; months: number }>();
      for (const p of payslips) {
        const cur = byEmp.get(p.employee.id) ?? { emp: p.employee, gross: 0, tds: 0, pf: 0, net: 0, months: 0 };
        cur.gross += p.grossEarnings;
        cur.tds += p.tds;
        cur.pf += p.pfEmployee;
        cur.net += p.netSalary;
        cur.months++;
        byEmp.set(p.employee.id, cur);
      }
      const rows: (string | number)[][] = [
        ["Employee Name", "Employee Code", "PAN", "Financial Year", "Gross Salary", "Months Paid", "TDS Deducted", "PF Deducted", "Net Salary Paid"],
        ...[...byEmp.values()].map(({ emp, gross, tds, pf, net, months }) => [
          `${emp.firstName} ${emp.lastName}`.trim(), emp.employeeNumber, emp.pan ?? "", fy,
          gross.toFixed(2), months, tds.toFixed(2), pf.toFixed(2), net.toFixed(2),
        ]),
      ];
      return new NextResponse(csv(rows), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="form16-working-${fy}.csv"` },
      });
    }

    if (type === "form24q") {
      const months = quarterMonths(month);
      const payslips = await prisma.payslip.findMany({
        where: { tenantId: session.tenantId, month: { in: months } },
        include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, pan: true } } },
        orderBy: { employee: { employeeNumber: "asc" } },
      });
      ensureFinalPayroll(payslips, months.join(", "));
      const missingPan = payslips.filter((p) => !p.employee.pan?.trim());
      if (missingPan.length) {
        return NextResponse.json({ error: `${new Set(missingPan.map((p) => p.employee.id)).size} paid employee(s) are missing PAN.` }, { status: 409 });
      }

      const byEmp = new Map<string, { emp: (typeof payslips)[number]["employee"]; tds: number; salary: number }>();
      for (const p of payslips) {
        const cur = byEmp.get(p.employee.id) ?? { emp: p.employee, tds: 0, salary: 0 };
        cur.tds += p.tds;
        cur.salary += p.grossEarnings;
        byEmp.set(p.employee.id, cur);
      }
      const rows: (string | number)[][] = [
        ["Employee Name", "Employee Code", "PAN", "Quarter Months", "Salary Paid", "TDS Deducted"],
        ...[...byEmp.values()].map(({ emp, tds, salary }) => [
          `${emp.firstName} ${emp.lastName}`.trim(), emp.employeeNumber, emp.pan ?? "", months.join(" / "), salary.toFixed(2), tds.toFixed(2),
        ]),
      ];
      return new NextResponse(csv(rows), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="form24q-working-${months[0]}-${months[2]}.csv"` },
      });
    }

    return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Compliance export failed." }, { status: 409 });
  }
}
