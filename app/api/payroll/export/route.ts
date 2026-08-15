import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";
import { buildBankFile, bankFileName, type BankFormat } from "@/lib/bank-file";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") || monthKey(new Date());
  const bankParam = (req.nextUrl.searchParams.get("bank") || "generic").toLowerCase();
  const bank: BankFormat = bankParam === "hdfc" || bankParam === "icici" ? bankParam : "generic";
  const debitAccount = req.nextUrl.searchParams.get("debitAccount") || "";

  const payslips = await prisma.payslip.findMany({
    where: { tenantId: session.tenantId, month },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, accountNumber: true, ifscCode: true } },
    },
  });

  const rows = payslips
    .filter((p) => p.employee.accountNumber && p.employee.ifscCode)
    .map((p) => ({
      name: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
      accountNumber: p.employee.accountNumber!,
      ifscCode: p.employee.ifscCode!,
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

  const res = new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${bankFileName(bank, month)}"`,
    },
  });
  if (missing > 0) res.headers.set("X-Skipped-Rows", String(missing));
  return res;
}
