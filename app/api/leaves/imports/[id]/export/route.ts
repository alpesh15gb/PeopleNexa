import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { formatDateIST } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const batch = await prisma.leaveBalanceImportBatch.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { leaveType: { select: { name: true, code: true } }, entries: { include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: { employeeNumber: "asc" } } },
  });
  if (!batch) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Reconciliation");
  sheet.addRow(["PeopleNexa leave balance reconciliation"]);
  sheet.addRow(["Profile", batch.schemaProfile, "Leave type", `${batch.leaveType.name} (${batch.leaveType.code})`]);
  sheet.addRow(["Cutoff", batch.throughMonth, "Period end (IST exclusive)", formatDateIST(batch.periodEnd)]);
  sheet.addRow([]);
  sheet.addRow(["Employee Code", "Employee", "Source row", "Opening", "Worked days", "Credited", "Availed", "Available", "Check"]);
  for (const entry of batch.entries) sheet.addRow([entry.employeeNumber, `${entry.employee.firstName} ${entry.employee.lastName}`, entry.sourceRow, entry.openingBalance, entry.workedDays, entry.credited, entry.availed, entry.available, "Imported immutable snapshot"]);
  sheet.getRow(6).font = { bold: true };
  sheet.columns = [{ width: 18 }, { width: 28 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 30 }];
  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="leave-reconciliation-${batch.throughMonth}.xlsx"` } });
}
