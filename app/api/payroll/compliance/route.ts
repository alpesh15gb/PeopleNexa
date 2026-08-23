import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";
import { fyFromMonth } from "@/lib/payroll";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
const pad = (n: number) => String(n).padStart(2, "0");
const integerRupees = (n: number) => Math.max(0, Math.round(n));

export function financialYearMonths(fy: string): string[] {
  const startYear = Number(fy.slice(0, 4));
  if (!Number.isInteger(startYear)) throw new Error("Invalid financial year.");
  return [
    ...Array.from({ length: 9 }, (_, i) => `${startYear}-${pad(i + 4)}`),
    ...Array.from({ length: 3 }, (_, i) => `${startYear + 1}-${pad(i + 1)}`),
  ];
}

export function quarterMonths(month: string): string[] {
  if (!MONTH_RE.test(month)) throw new Error("Invalid month.");
  const [y, m] = month.split("-").map(Number);
  const start = m >= 4 && m <= 6 ? 4 : m >= 7 && m <= 9 ? 7 : m >= 10 ? 10 : 1;
  return [0, 1, 2].map((i) => `${y}-${pad(start + i)}`);
}

function basicFromPayslip(p: { baseSalary: number; allowances: number }): number {
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
    if (type === "ecr" || type === "pf_register") {
      const payslips = await prisma.payslip.findMany({
        where: { tenantId: session.tenantId, month },
        include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, uan: true, joiningDate: true } } },
        orderBy: { employee: { employeeNumber: "asc" } },
      });
      ensureFinalPayroll(payslips, month);
      const covered = payslips.filter((p) => p.pfEmployee > 0 || p.pfEmployer > 0);
      const missingUan = covered.filter((p) => !/^\d{12}$/.test(p.employee.uan?.trim() ?? ""));
      if (missingUan.length) {
        return NextResponse.json({ error: `${missingUan.length} PF-covered employee(s) have a missing/invalid 12-digit UAN.` }, { status: 409 });
      }

      if (type === "ecr") {
        // Current EPFO regular-return file: 11 fields separated by #~#.
        // EPS/EDLI use the standard ₹15,000 wage ceiling. Employee-specific
        // excluded-EPS cases require master-data support and are therefore
        // deliberately blocked below when contribution math is inconsistent.
        const lines: string[] = [];
        for (const p of covered) {
          const grossWages = integerRupees(p.grossEarnings);
          const basic = basicFromPayslip(p);
          const epfWages = integerRupees(Math.min(basic, 15000));
          const epsWages = epfWages;
          const edliWages = epfWages;
          const ee = integerRupees(p.pfEmployee);
          const employerTotal = integerRupees(p.pfEmployer);
          const eps = integerRupees(Math.min(epsWages * 0.0833, 1250));
          const erEpf = Math.max(0, employerTotal - eps);
          if (ee > grossWages || employerTotal < eps) {
            throw new Error(`PF calculation for employee ${p.employee.employeeNumber} is inconsistent; regenerate payroll before ECR.`);
          }
          const ncpDays = Math.max(0, Math.round(p.absentDays));
          const fields = [
            p.employee.uan!.trim(),
            `${p.employee.firstName} ${p.employee.lastName}`.trim().replace(/[\r\n#~]/g, " "),
            grossWages,
            epfWages,
            epsWages,
            edliWages,
            ee,
            eps,
            erEpf,
            ncpDays,
            0,
          ];
          lines.push(fields.join("#~#"));
        }
        return new NextResponse(lines.join("\r\n") + (lines.length ? "\r\n" : ""), {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="ecr-${month}.txt"` },
        });
      }

      const rows: (string | number)[][] = [
        ["Employee Code", "Member Name", "UAN", "Gross Wages", "EPF Wages", "EE PF", "Employer PF Total", "NCP Days"],
        ...covered.map((p) => [
          p.employee.employeeNumber,
          `${p.employee.firstName} ${p.employee.lastName}`.trim(),
          p.employee.uan ?? "",
          p.grossEarnings.toFixed(2),
          Math.min(basicFromPayslip(p), 15000).toFixed(2),
          p.pfEmployee.toFixed(2),
          p.pfEmployer.toFixed(2),
          p.absentDays,
        ]),
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
      const missingPan = payslips.filter((p) => !/^[A-Z]{5}\d{4}[A-Z]$/.test(p.employee.pan?.trim().toUpperCase() ?? ""));
      if (missingPan.length) {
        return NextResponse.json({ error: `${new Set(missingPan.map((p) => p.employee.id)).size} paid employee(s) have a missing/invalid PAN.` }, { status: 409 });
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
      // This is the annual salary/TDS working used to prepare Form 16. The
      // digitally-signed TRACES Form 16 itself is issued through the tax portal.
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
      const missingPan = payslips.filter((p) => !/^[A-Z]{5}\d{4}[A-Z]$/.test(p.employee.pan?.trim().toUpperCase() ?? ""));
      if (missingPan.length) {
        return NextResponse.json({ error: `${new Set(missingPan.map((p) => p.employee.id)).size} paid employee(s) have a missing/invalid PAN.` }, { status: 409 });
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
      // Form 24Q filing requires deductor/TAN/challan metadata not modelled in
      // the current schema. Export a validated working rather than fabricating
      // a filing file with missing statutory fields.
      return new NextResponse(csv(rows), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="form24q-working-${months[0]}-${months[2]}.csv"` },
      });
    }

    return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Compliance export failed." }, { status: 409 });
  }
}
