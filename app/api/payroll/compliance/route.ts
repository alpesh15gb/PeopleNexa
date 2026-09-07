import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKey } from "@/lib/dates";
import { fyFromMonth } from "@/lib/payroll";
import { fiscalYearMonths, quarterMonths } from "@/lib/payroll-periods";

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");

/** GET /api/payroll/compliance?type=ecr|form16|form24q&month=2026-08 */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = String(req.nextUrl.searchParams.get("type") ?? "ecr");
  const month = req.nextUrl.searchParams.get("month") || monthKey(new Date());
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }
  const fy = fyFromMonth(month);

  if (type === "ecr") {
    const payslips = await prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month },
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true, uan: true, pan: true, joiningDate: true } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    });
    const rows: (string | number)[][] = [
      ["S.No", "Member ID", "Member Name", "UAN", "Date of Joining", "EPF Wages (Basic)", "EE EPF (12%)", "ER EPF (3.67%)", "ER EPS (8.33%)"],
      ...payslips.map((p, i) => {
        // EPF wages are capped at the 15000 statutory ceiling. Prefer the
        // persisted basic wage; fall back to the legacy derivation for old rows.
        const rawBasic = p.basicSalary > 0 ? p.basicSalary : p.pfEmployee > 0 ? p.pfEmployee / 0.12 : p.baseSalary * 0.5;
        const wages = Math.min(Math.max(rawBasic, 0), 15000);
        // EPS = 8.33% of capped wages, capped at 1250. Prefer persisted PF
        // splits; ER EPF = persisted employer share minus EPS.
        const eps = Math.min(1250, Math.round(wages * 0.0833));
        const ee = p.pfEmployee > 0 ? p.pfEmployee : Math.round(wages * 0.12 * 100) / 100;
        const erTotal = p.pfEmployer > 0 ? p.pfEmployer : Math.round(wages * 0.12 * 100) / 100;
        const erPpf = Math.max(0, Math.round((erTotal - eps) * 100) / 100);
        return [
          i + 1,
          p.employee.employeeNumber,
          `${p.employee.firstName} ${p.employee.lastName}`.trim(),
          p.employee.uan ?? "",
          p.employee.joiningDate ? p.employee.joiningDate.toISOString().slice(0, 10) : "",
          wages.toFixed(2),
          Number(ee).toFixed(2),
          erPpf.toFixed(2),
          eps.toFixed(2),
        ];
      }),
    ];
    const missing = payslips.filter((p) => !p.employee.uan || !p.employee.pan).length;
    let body = csv(rows);
    if (missing > 0) body = `# WARNING: ${missing} row(s) missing UAN/PAN\n` + body;
    const res = new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pf-ecr-${month}.csv"`,
      },
    });
    if (missing > 0) res.headers.set("X-Compliance-Warnings", String(missing));
    return res;
  }

  if (type === "form16") {
    const payslips = await prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month: { in: fiscalYearMonths(month) } },
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, pan: true } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    });
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
      ["Employee Name", "Employee Code", "PAN", "Gross Salary", "Months Paid", "Total TDS (Section 192)", "Total PF Deducted", "Net Salary (est.)"],
      ...[...byEmp.values()].map(({ emp, gross, tds, pf, net, months }) => [
        `${emp.firstName} ${emp.lastName}`.trim(),
        emp.employeeNumber,
        emp.pan ?? "",
        gross.toFixed(2),
        months,
        tds.toFixed(2),
        pf.toFixed(2),
        net.toFixed(2),
      ]),
    ];
    const missingPan = [...byEmp.values()].filter(({ emp }) => !emp.pan).length;
    let form16Body = csv(rows);
    if (missingPan > 0) form16Body = `# WARNING: ${missingPan} row(s) missing UAN/PAN\n` + form16Body;
    const form16Res = new NextResponse(form16Body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="form16-${fy}.csv"`,
      },
    });
    if (missingPan > 0) form16Res.headers.set("X-Compliance-Warnings", String(missingPan));
    return form16Res;
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
    const missingPan24q = [...byEmp.values()].filter(({ emp }) => !emp.pan).length;
    let form24qBody = csv(rows);
    if (missingPan24q > 0) form24qBody = `# WARNING: ${missingPan24q} row(s) missing UAN/PAN\n` + form24qBody;
    const form24qRes = new NextResponse(form24qBody, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="form24q-${month}.csv"`,
      },
    });
    if (missingPan24q > 0) form24qRes.headers.set("X-Compliance-Warnings", String(missingPan24q));
    return form24qRes;
  }

  return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
}
