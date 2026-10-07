import { prisma } from "../lib/prisma";
import { assertLeavePayrollOpen } from "../lib/leave-payroll-lock";
import { istDateKey, parseIST, IST_OFFSET_MS } from "../lib/ist";
import { automaticShiftPolicy, AUTOMATIC_SHIFT_KIND } from "../lib/automatic-shifts";
export async function repairCrossDayAttendance(args = process.argv.slice(2)) {
const [identity, month, lastOrMode, applyArg] = args;
const lastMonth = lastOrMode && lastOrMode !== "--apply" ? lastOrMode : month;
const mode = lastOrMode === "--apply" || applyArg === "--apply" ? "--apply" : undefined;
  if (identity === "--list-tenants") { console.log(JSON.stringify(await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } }), null, 2)); return; }
  if (!identity || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "") || (!/^\d{4}-(0[1-9]|1[0-2])$/.test(lastMonth ?? "") || lastMonth < month || (applyArg && applyArg !== "--apply"))) throw new Error("Usage: npx tsx scripts/repair-cross-day-attendance.ts TENANT_ID_OR_NAME START_MONTH [END_MONTH] [--apply]");
  const matches = await prisma.tenant.findMany({ where: { OR: [{ id: identity }, { name: identity }, { slug: identity }] }, select: { id: true } });
  if (matches.length !== 1) throw new Error("Tenant must match exactly one workspace. Use --list-tenants to find its ID.");
  const tenantId = matches[0].id;
  const totals = { candidates: 0, updated: 0, locked: 0, skippedShift: 0 };
  const start = parseIST(`${month}-01 00:00:00`)!;
  const end = new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 1) - IST_OFFSET_MS);
  const rows = await prisma.attendance.findMany({ where: { tenantId, date: { gte: start, lt: end }, shiftId: null, punchInTime: { not: null }, punchOutTime: { not: null } }, include: { employee: { select: { employeeNumber: true } } } });
  let changed = 0;
  for (const row of rows) {
    if (istDateKey(row.punchInTime!) === istDateKey(row.punchOutTime!)) continue;
    const roster = await prisma.rosterAssignment.count({ where: { tenantId, employeeId: row.employeeId, date: row.date } });
    const config = row.branchId ? await prisma.configurationRecord.findFirst({ where: { tenantId, kind: AUTOMATIC_SHIFT_KIND, scopeKey: `branch:${row.branchId}`, active: true, effectiveFrom: { lte: row.date } } }) : null;
    if (roster || automaticShiftPolicy(config?.payload)?.enabled) { totals.skippedShift++; continue; }
    totals.candidates++;
    console.log(JSON.stringify({ attendanceId: row.id, employee: row.employee.employeeNumber, date: istDateKey(row.date), invalidOut: row.punchOutTime, apply: mode === "--apply" }));
    try { await prisma.$transaction(async (tx) => {
      await assertLeavePayrollOpen(tx, tenantId, row.employeeId, row.date, row.date);
      if (mode !== "--apply") return;
      if (await tx.rosterAssignment.count({ where: { tenantId, employeeId: row.employeeId, date: row.date } })) return;
      const result = await tx.attendance.updateMany({ where: { id: row.id, tenantId, updatedAt: row.updatedAt, shiftId: null }, data: { punchOutTime: null, overtimeMinutes: 0, reviewStatus: "missed_punch", note: "Missing OUT: invalid next-day pairing removed. Original punches preserved; regularization required.", punches: Array.isArray(row.punches) ? row.punches.filter((p: any) => p?.time && istDateKey(new Date(p.time)) === istDateKey(row.date)) : row.punches ?? [] } });
      if (result.count) await tx.auditLog.create({ data: { tenantId, actorId: "maintenance:cross-day-repair", actorRole: "system", action: "attendance.cross_day_pairing_repair", entity: "Attendance", entityId: row.id, summary: `Removed invalid next-day OUT on ${istDateKey(row.date)}`, before: { punchOutTime: row.punchOutTime!.toISOString(), overtimeMinutes: row.overtimeMinutes, reviewStatus: row.reviewStatus, note: row.note, punches: row.punches }, after: { punchOutTime: null, overtimeMinutes: 0, reviewStatus: "missed_punch" } } });
      changed += result.count;
    }, { isolationLevel: "Serializable" }); } catch (error: any) {
      if (error.code !== "PAYROLL_LOCKED") throw error;
      totals.locked++;
      console.log(JSON.stringify({ employee: row.employee.employeeNumber, date: istDateKey(row.date), outcome: "payroll_locked", reason: error.message }));
    }
  }
  totals.updated = changed;
  console.log(JSON.stringify(totals));
  console.log(`Updated ${changed} records. Original Punch rows and payslips were not changed.`);
  return totals;
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/repair-cross-day-attendance.ts")) repairCrossDayAttendance().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
