import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { buildBankFile, bankFileName, type BankFormat } from "@/lib/bank-file";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { createHash } from "crypto";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const month = req.nextUrl.searchParams.get("month") || monthKeyIST(new Date());
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }
  const bankParam = (req.nextUrl.searchParams.get("bank") || "generic").toLowerCase();
  const bank: BankFormat = bankParam === "hdfc" || bankParam === "icici" ? bankParam : "generic";
  const debitAccount = req.nextUrl.searchParams.get("debitAccount") || "";
  const runId = req.nextUrl.searchParams.get("runId") || "";
  if (!runId) return NextResponse.json({ error: "A finalized payroll run is required for bank export." }, { status: 400 });
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId: session.tenantId, month } });
  if (!run) return NextResponse.json({ error: "Payroll run not found for this period." }, { status: 404 });
  if (run.status !== "finalized" && run.status !== "paid") return NextResponse.json({ error: "Bank export is available only after finalization." }, { status: 409 });

  // Bank files are for unpaid slips unless a caller explicitly requests otherwise.
  const statusParam = (req.nextUrl.searchParams.get("status") || "draft").toLowerCase();
  if (!["all", "paid", "draft"].includes(statusParam)) {
    return NextResponse.json({ error: "status must be one of: all, paid, draft." }, { status: 400 });
  }

  const payslips = await prisma.payslip.findMany({
    where: {
      tenantId: session.tenantId,
      month,
      payrollRunId: runId,
      ...(statusParam === "all" ? {} : { status: statusParam }),
      ...(locationId ? { employee: employeeLocationScope(locationId) } : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const rows = payslips
    .map((p) => ({ p, bank: (p.inputSnapshot as { bank?: { accountNumber?: string; ifscCode?: string } } | null)?.bank }))
    .filter(({ bank }) => bank?.accountNumber && bank?.ifscCode)
    .map(({ p, bank }) => ({
      name: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
      accountNumber: bank!.accountNumber!,
      ifscCode: bank!.ifscCode!,
      amount: p.netSalary,
    }));

  const missing = payslips.length - rows.length;
  if (rows.length === 0) {
    return NextResponse.json(
      { error: `No payslips with bank details for ${month}. Add account number + IFSC on employee profiles first.` },
      { status: 400 }
    );
  }

  const narration = `Salary ${month}`;
  const content = buildBankFile(bank, rows, debitAccount, narration);
  const hash = createHash("sha256").update(content).digest("hex");
  await prisma.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "payroll_run.bank_export", entity: "PayrollRun", entityId: runId, summary: `Immutable bank export ${bank} (${rows.length} rows)`, after: { sha256: hash, rowCount: rows.length } } });

  const res = new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${bankFileName(bank, month)}"`,
    },
  });
  if (missing > 0) res.headers.set("X-Skipped-Rows", String(missing));
  return res;
}
