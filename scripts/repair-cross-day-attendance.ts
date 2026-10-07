import { prisma } from "../lib/prisma";
import { assertLeavePayrollOpen } from "../lib/leave-payroll-lock";
import { istDateKey, parseIST, IST_OFFSET_MS } from "../lib/ist";
import { automaticShiftsForEmployee } from "../lib/automatic-shift-resolution";
const [tenantId, month, mode] = process.argv.slice(2);
async function main() {
  if (!tenantId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "") || (mode && mode !== "--apply")) throw new Error("Usage: npx tsx scripts/repair-cross-day-attendance.ts TENANT_ID YYYY-MM [--apply]");
  const start = parseIST(`${month}-01 00:00:00`)!;
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1) - IST_OFFSET_MS);
  const rows = await prisma.attendance.findMany({ where: { tenantId, date: { gte: start, lt: end }, shiftId: null, punchInTime: { not: null }, punchOutTime: { not: null }, employee: { shiftId: null } }, include: { employee: { select: { employeeNumber: true } } } });
  let changed = 0;
  for (const row of rows) {
    if (istDateKey(row.punchInTime!) === istDateKey(row.punchOutTime!)) continue;
    const roster = await prisma.rosterAssignment.count({ where: { tenantId, employeeId: row.employeeId, date: row.date } });
    if (roster) continue;
    if (await automaticShiftsForEmployee({ id: row.employeeId, tenantId })) continue;
    console.log(JSON.stringify({ attendanceId: row.id, employee: row.employee.employeeNumber, date: istDateKey(row.date), invalidOut: row.punchOutTime, apply: mode === "--apply" }));
    if (mode !== "--apply") continue;
    await prisma.$transaction(async (tx) => {
      await assertLeavePayrollOpen(tx, tenantId, row.employeeId, row.date, row.date);
      const result = await tx.attendance.updateMany({ where: { id: row.id, tenantId, updatedAt: row.updatedAt, shiftId: null, employee: { shiftId: null } }, data: { punchOutTime: null, overtimeMinutes: 0, reviewStatus: "missed_punch", note: "Missing OUT: invalid next-day pairing removed. Original punches preserved; regularization required.", punches: Array.isArray(row.punches) ? row.punches.filter((p: any) => p?.time && istDateKey(new Date(p.time)) === istDateKey(row.date)) : row.punches ?? [] } });
      changed += result.count;
    });
  }
  console.log(`Updated ${changed} records. Original Punch rows and payslips were not changed.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
