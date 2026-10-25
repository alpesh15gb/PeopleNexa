/** Read-only historical evidence report. There is deliberately no apply mode.
 * DATABASE_URL must be supplied explicitly; this script does not load .env.
 * Usage: tsx scripts/preview-attendance-repair.ts TENANT FROM TO OUTPUT.json [LOCATION_CODE]
 */
import { writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { dayRangeIST, isDateKey } from "../lib/dates";
import { istDateKey } from "../lib/ist";
import { assignmentPendingWhere } from "../lib/employee-assignment";
import { employeeLocationScope } from "../lib/location-scope";
import { assessmentRequiresReview } from "../lib/attendance-assessment";
import { crossDayRepairPlan } from "../lib/cross-day-repair-plan";
import { AUTOMATIC_SHIFT_KIND } from "../lib/automatic-shifts";
import type { PunchMode } from "../lib/reconcile";

async function main() {
  const [tenantId, from, to, output, locationCode] = process.argv.slice(2);
  if (!process.env.DATABASE_URL || !tenantId || !isDateKey(from) || !isDateKey(to) || !output) throw new Error("Supply DATABASE_URL, TENANT FROM TO OUTPUT.json [LOCATION_CODE].");
  const start = dayRangeIST(from).start, end = dayRangeIST(to).end;
  if (end <= start || end.getTime() - start.getTime() > 93 * 86400000) throw new Error("Select at most 93 days.");
  const result = await prisma.$transaction(async db => {
    await db.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, config: true } });
    const location = locationCode ? await db.location.findFirstOrThrow({ where: { tenantId, code: locationCode }, select: { id: true } }) : null;
    const employees = await db.employee.findMany({ where: { tenantId, loginOnly: false, ...(location ? employeeLocationScope(location.id) : {}) }, select: { id: true, employeeNumber: true, deviceCode: true, firstName: true, lastName: true, status: true, joiningDate: true, shiftId: true } });
    const ids = employees.map(e => e.id);
    const [records, allPunches, rosters, rawLogs, runs, paidSlips, configs, pendingEmployees] = await Promise.all([
      db.attendance.findMany({ where: { tenantId, employeeId: { in: ids }, date: { gte: start, lt: end } } }),
      db.punch.findMany({ where: { tenantId, employeeId: { in: ids }, punchTime: { gte: start, lt: end } }, select: { id: true, employeeId: true, authStatus: true, eventKey: true, punchTime: true, inOutHint: true, deviceId: true, source: true } }),
      db.rosterAssignment.findMany({ where: { tenantId, employeeId: { in: ids }, date: { gte: start, lt: end } }, select: { employeeId: true, date: true } }),
      db.deviceLog.findMany({ where: { tenantId, userId: { in: employees.map(e => e.deviceCode ?? e.employeeNumber) }, punchTime: { gte: start, lt: end } }, select: { id: true, userId: true, punchTime: true, processed: true, error: true } }),
      db.payrollRun.findMany({ where: { tenantId, month: { gte: from.slice(0,7), lte: to.slice(0,7) }, status: { in: ["reviewed", "approved", "finalized", "paid"] } }, select: { month: true, members: { select: { employeeId: true } }, payslips: { select: { employeeId: true } } } }),
      db.payslip.findMany({ where: { tenantId, month: { gte: from.slice(0,7), lte: to.slice(0,7) }, status: "paid" }, select: { employeeId: true, month: true } }),
      db.configurationRecord.count({ where: { tenantId, kind: AUTOMATIC_SHIFT_KIND, active: true } }),
      db.employee.findMany({ where: { tenantId, id: { in: ids }, AND: [assignmentPendingWhere] }, select: { id: true } }),
    ]);
    const assignmentPending = new Set(pendingEmployees.map(e => e.id));
    const punches = allPunches.filter(p => ["auto", "approved"].includes(p.authStatus));
    const employeesById = new Map(employees.map(e => [e.id, e]));
    const employeeByCode = new Map(employees.map(e => [e.deviceCode ?? e.employeeNumber, e]));
    const recordByDay = new Map(records.map(r => [`${r.employeeId}|${istDateKey(r.date)}`, r]));
    const rosterDays = new Set(rosters.map(r => `${r.employeeId}|${istDateKey(r.date)}`));
    const paid = new Set(paidSlips.map(p => `${p.employeeId}|${p.month}`));
    for (const run of runs) for (const member of [...run.members, ...run.payslips]) paid.add(`${member.employeeId}|${run.month}`);
    const eventKeys = new Set(allPunches.map(p => p.eventKey));
    const punchesByDay = new Map<string, typeof punches>();
    for (const punch of punches) {
      const key = `${punch.employeeId}|${istDateKey(punch.punchTime)}`;
      const items = punchesByDay.get(key) ?? []; items.push(punch); punchesByDay.set(key, items);
    }
    const issues: Array<Record<string, unknown>> = [];
    const mode = (tenant.config as { punches?: { mode?: PunchMode } } | null)?.punches?.mode ?? "first_last";
    for (const [key, evidence] of punchesByDay) {
      const employee = employeesById.get(evidence[0].employeeId)!;
      const day = key.slice(key.indexOf("|") + 1), row = recordByDay.get(key);
      const knownShift = Boolean(row?.shiftId || employee.shiftId || rosterDays.has(key));
      if (row && !assessmentRequiresReview(row, knownShift)) continue;
      const manual = row?.reviewStatus === "manual_override";
      const payrollProtected = paid.has(`${employee.id}|${day.slice(0,7)}`);
      const beforeJoining = Boolean(employee.joiningDate && day < istDateKey(employee.joiningDate));
      const reason = !row ? "authorized_punches_without_attendance" : "attendance_requires_review";
      const plan = !knownShift ? crossDayRepairPlan(evidence, mode, false) : null;
      issues.push({ employeeId: employee.id, employeeNumber: employee.employeeNumber, employeeName: `${employee.firstName} ${employee.lastName}`.trim(), deviceCode: employee.deviceCode, day, reason, attendanceId: row?.id ?? null,
        current: row ? { in: row.punchInTime, out: row.punchOutTime, status: row.status, reviewStatus: row.reviewStatus, finalized: row.finalized } : null,
        authorizedEvidence: evidence.map(p => ({ id: p.id, at: p.punchTime, hint: p.inOutHint, source: p.source })),
        protection: { manual, payrollProtected, beforeJoining, assignmentPending: assignmentPending.has(employee.id), inactive: employee.status !== "active", knownShift },
        sameCalendarDayCandidate: plan?.eligible ? plan.data : null,
        decision: manual || payrollProtected || beforeJoining || assignmentPending.has(employee.id) || employee.status !== "active" ? "protected_do_not_automatically_change" : knownShift || configs > 0 ? "review_historical_shift_and_workday" : plan?.eligible ? "candidate_requires_reviewed_approval" : "insufficient_pair_evidence",
      });
    }
    for (const log of rawLogs) {
      if (!log.punchTime || eventKeys.has(`device-log:${log.id}`)) continue;
      const employee = employeeByCode.get(log.userId!);
      if (!employee) continue;
      issues.push({ employeeId: employee.id, employeeNumber: employee.employeeNumber, employeeName: `${employee.firstName} ${employee.lastName}`.trim(), deviceCode: employee.deviceCode, day: istDateKey(log.punchTime), reason: "retained_source_event_without_normalized_punch", sourceLogId: log.id, at: log.punchTime, processed: log.processed, error: log.error, decision: employee.status !== "active" ? "inactive_do_not_activate" : assignmentPending.has(employee.id) ? "assignment_pending_requires_review" : employee.joiningDate && istDateKey(log.punchTime) < istDateKey(employee.joiningDate) ? "before_joining_requires_review" : paid.has(`${employee.id}|${istDateKey(log.punchTime).slice(0,7)}`) ? "payroll_protected_requires_review" : "review_mapping_history_then_explicit_historical_recovery" });
    }
    const reasons: Record<string, number> = {}, decisions: Record<string, number> = {};
    for (const issue of issues) { const reason = String(issue.reason), decision = String(issue.decision); reasons[reason] = (reasons[reason] ?? 0) + 1; decisions[decision] = (decisions[decision] ?? 0) + 1; }
    return { mode: "read_only_preview", tenantId, from, to, locationCode: locationCode ?? null, generatedAt: new Date().toISOString(), source: { employees: employees.length, attendance: records.length, authorizedPunches: punches.length, retainedDeviceLogs: rawLogs.length }, summary: { issues: issues.length, reasons, decisions }, limitations: ["Candidates use calendar-day evidence; historical shift/roster and manual decisions require review before any write.", "No employee status, source event, attendance, payroll or device command was changed.", "Missing normalization is checked by immutable device-log event key; equivalent events from another source require duplicate review."], issues };
  }, { isolationLevel: "RepeatableRead", timeout: 60_000 });
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, ...result.summary, mode: result.mode }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
