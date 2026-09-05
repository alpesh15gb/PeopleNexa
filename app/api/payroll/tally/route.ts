import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKey } from "@/lib/dates";
import { round2 } from "@/lib/utils";

/**
 * Tally-ready salary journal CSV.
 * Debit  : Salary Expense (gross)
 * Credits: PF / ESIC / PT / LWF / TDS payables + Bank (net) — balanced journal.
 * Columns match Tally's voucher-import layout accountants can map directly.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") || monthKey(new Date());
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }
  const payslips = await prisma.payslip.findMany({ where: { tenantId: session.tenantId, month } });

  const totals = payslips.reduce(
    (a, p) => {
      a.gross += p.grossEarnings;
      a.pfEmp += p.pfEmployee;
      a.pfEr += p.pfEmployer;
      a.esicEmp += p.esicEmployee;
      a.esicEr += p.esicEmployer;
      a.pt += p.professionalTax;
      a.lwf += p.lwf;
      a.tds += p.tds;
      a.loan += p.loanDeduction;
      a.net += p.netSalary;
      a.deductions += p.deductions;
      return a;
    },
    { gross: 0, pfEmp: 0, pfEr: 0, esicEmp: 0, esicEr: 0, pt: 0, lwf: 0, tds: 0, loan: 0, net: 0, deductions: 0 }
  );

  // Residual deductions not covered by statutory lines (late fines, absent-day
  // deductions, negative adjustments) — payable to the company.
  const otherDeductions = Math.max(
    0,
    round2(totals.deductions - totals.pfEmp - totals.esicEmp - totals.pt - totals.lwf - totals.tds - totals.loan)
  );

  const label = `Salary for ${month}`;
  const rows: (string | number)[][] = [
    ["Date", "Particulars", "Voucher Type", "Voucher No", "Debit Amount", "Credit Amount"],
    [month + "-01", `Salary Expense (${label})`, "Journal", "1", totals.gross.toFixed(2), ""],
    ...(totals.pfEr > 0 ? [[month + "-01", "Employer PF Contribution (company)", "Journal", "1", totals.pfEr.toFixed(2), ""]] as (string | number)[][] : []),
    ...(totals.esicEr > 0 ? [[month + "-01", "Employer ESIC Contribution (company)", "Journal", "1", totals.esicEr.toFixed(2), ""]] as (string | number)[][] : []),
    ...(totals.pfEmp + totals.pfEr > 0
      ? [[month + "-01", "PF Payable", "Journal", "1", "", (totals.pfEmp + totals.pfEr).toFixed(2)]] as (string | number)[][]
      : []),
    ...(totals.esicEmp + totals.esicEr > 0
      ? [[month + "-01", "ESIC Payable", "Journal", "1", "", (totals.esicEmp + totals.esicEr).toFixed(2)]] as (string | number)[][]
      : []),
    ...(totals.pt > 0 ? [[month + "-01", "Professional Tax Payable", "Journal", "1", "", totals.pt.toFixed(2)]] as (string | number)[][] : []),
    ...(totals.lwf > 0 ? [[month + "-01", "LWF Payable", "Journal", "1", "", totals.lwf.toFixed(2)]] as (string | number)[][] : []),
    ...(totals.tds > 0 ? [[month + "-01", "TDS Payable", "Journal", "1", "", totals.tds.toFixed(2)]] as (string | number)[][] : []),
    ...(totals.loan > 0 ? [[month + "-01", "Employee Loan Recovery Payable", "Journal", "1", "", totals.loan.toFixed(2)]] as (string | number)[][] : []),
    ...(otherDeductions > 0
      ? [[month + "-01", "Other Deductions Payable (late fines etc.)", "Journal", "1", "", otherDeductions.toFixed(2)]] as (string | number)[][]
      : []),
    [month + "-01", "Bank (Salary Account)", "Journal", "1", "", totals.net.toFixed(2)],
  ];

  const content = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tally-journal-${month}.csv"`,
    },
  });
}
