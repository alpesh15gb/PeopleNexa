import assert from "node:assert/strict";
import type { Prisma } from "../generated/prisma/client";
import { leaveCalendar, leaveEligibilityError, snapshottedLeaveFraction } from "../lib/leave-calendar";
import { leavePolicyDraft } from "../lib/configuration";
import { attendanceSummary } from "../lib/payroll";
import { attendanceChanged, payrollSourceReview } from "../lib/payroll-source-review";
import { assertLeavePayrollOpen } from "../lib/leave-payroll-lock";
import { reviewLeaveCancellation } from "../lib/leave-cancellation";
import { encashableLeaveAt } from "../lib/leave-encashment";
import { computeFandF } from "../lib/exit";
import { canTransitionPayrollRun, payrollRunTransitionData } from "../lib/payroll-runs";

async function main() {
  const working = { dayCounting: "working_days" as const, weeklyOffDays: [0, 6] };
  const dates = leaveCalendar("2026-10-02", "2026-10-05", working, []);
  assert.equal(dates.days, 2, "Friday-Monday deducts only two working days");
  assert.equal(leaveCalendar("2026-10-02", "2026-10-05", { ...working, dayCounting: "sandwich" }, []).days, 4);
  assert.equal(leaveCalendar("2026-10-03", "2026-10-05", { ...working, dayCounting: "sandwich" }, []).days, 1, "leading offs are not enclosed");
  assert.equal(leaveCalendar("2026-10-02", "2026-10-05", { dayCounting: "calendar_days" }, []).days, 4);
  const holiday = { date: new Date("2025-10-02T00:00:00Z"), isRecurring: true, isHalfDay: false };
  assert.equal(leaveCalendar("2026-10-02", "2026-10-05", working, [holiday]).days, 1);
  assert.equal(leaveCalendar("2026-10-02", "2026-10-02", working, [{ ...holiday, isHalfDay: true }]).days, 0.5);
  assert.equal(leaveCalendar("2026-10-03", "2026-10-03", working, [], true).days, 0);
  assert.throws(() => leaveCalendar("2026-10-02", "2026-10-05", working, [], true));
  assert.equal(snapshottedLeaveFraction({ calendar: dates }, "2026-10-03"), 0);
  assert.throws(() => snapshottedLeaveFraction({ calendar: dates }, "2026-10-06"));
  assert.equal(leaveEligibilityError({ requiresReason: true }, "2026-10-05", 1, null, ""), "A reason is required for this leave type.");
  assert.match(leaveEligibilityError({ noticeDays: 3 }, "2026-10-05", 1, null, "test", new Date("2026-10-04"))!, /at least 3/);
  assert.match(leaveEligibilityError({ minServiceDays: 30 }, "2026-10-05", 1, new Date("2026-10-01"), "test")!, /service requirement/);
  assert.match(leaveEligibilityError({ maxConsecutiveDays: 1 }, "2026-10-05", 2, null, "test")!, /at most/);
  const rule = { name: "CL", code: "CL", annualEntitlement: 12, paid: true, allowsHalfDay: true, requiresApproval: true, carryForward: false, carryForwardLimit: null, ...working, maxConsecutiveDays: 1.5 };
  assert.ok(leavePolicyDraft({ leaveTypes: [rule] }));
  assert.equal(leavePolicyDraft({ leaveTypes: [{ ...rule, weeklyOffDays: [7] }] }), null);
  assert.equal(leavePolicyDraft({ leaveTypes: [{ ...rule, noticeDays: -1 }] }), null);

  const records = Array.from({ length: 31 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, i + 1)), status: "present", punchInTime: null, punchOutTime: null }));
  const db = {
    attendance: { findMany: async () => records },
    leaveRequest: { findMany: async () => [{ fromDate: new Date("2026-10-02"), toDate: new Date("2026-10-05"), days: 2, leaveType: { paid: false }, leavePolicySnapshot: { rules: { paid: false }, calendar: dates } }] },
    holiday: { findMany: async () => [] }, rosterAssignment: { findMany: async () => [] },
  };
  const summary = await attendanceSummary("t", { id: "e", shiftId: null }, "2026-10", true, db as unknown as Prisma.TransactionClient);
  assert.equal(summary.unpaidLeaveDays, 2);
  assert.equal(summary.absentDays, 0, "excluded weekly offs do not become absences");
  assert.equal(summary.presentDays, 27);
  const halfHolidayCalendar = leaveCalendar("2026-10-02", "2026-10-02", working, [{ ...holiday, isHalfDay: true }]);
  const halfHolidayDb = { ...db, leaveRequest: { findMany: async () => [{ fromDate: new Date("2026-10-02"), toDate: new Date("2026-10-02"), days: 0.5, leaveType: { paid: false }, leavePolicySnapshot: { rules: { paid: false }, calendar: halfHolidayCalendar } }] } };
  const halfHolidaySummary = await attendanceSummary("t", { id: "e", shiftId: null }, "2026-10", true, halfHolidayDb as unknown as Prisma.TransactionClient);
  assert.equal(halfHolidaySummary.unpaidLeaveDays, 0.5);
  assert.equal(halfHolidaySummary.presentDays, 30, "holiday half is neither worked attendance nor another absence");
  assert.equal(halfHolidaySummary.absentDays, 0);
  assert.equal(attendanceChanged(summary, { ...summary }), false);
  assert.equal(attendanceChanged(summary, { ...summary, unpaidLeaveDays: 3 }), true);
  assert.equal(attendanceChanged(null, summary), true);
  assert.equal(attendanceChanged(summary, { ...summary, workedHours: NaN }), true);
  const unresolved = { leaveRequest: { count: async () => 1 } } as unknown as Prisma.TransactionClient;
  assert.match((await payrollSourceReview(unresolved, "t", "2026-10", []))[0], /pending leave/);
  const sourceDb = { ...db, leaveRequest: { ...db.leaveRequest, count: async () => 0 } };
  assert.deepEqual(await payrollSourceReview(sourceDb as unknown as Prisma.TransactionClient, "t", "2026-10", [{ employeeId: "e", inputSnapshot: { attendance: summary, employee: { joiningDate: null, shiftId: null } }, employee: { id: "e", joiningDate: new Date("2026-10-15"), shiftId: "changed-shift", firstName: "Test", lastName: "Employee" } }]), [], "review keeps explicitly saved null joining date and shift rather than applying later employee edits");
  let locked = true;
  let request: any = { id: "r", employeeId: "e", createdBy: "maker", status: "approved", cancellationRequestedBy: "e", cancellationRequestedAt: new Date(), cancellationReason: "Plan changed", fromDate: new Date("2026-10-02"), toDate: new Date("2026-10-05"), days: 2 };
  const audit: unknown[] = [];
  const tx = {
    payrollRun: { findFirst: async (query: any) => { assert.equal(query.where.tenantId, "t"); assert.deepEqual(query.where.status.in, ["reviewed", "approved", "finalized", "paid"]); return locked ? { month: "2026-10", status: "paid" } : null; } },
    leaveRequest: { findFirst: async () => request, updateMany: async ({ data }: any) => { request = { ...request, ...data }; return { count: 1 }; } },
    auditLog: { create: async (data: unknown) => { audit.push(data); } },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(() => assertLeavePayrollOpen(tx, "t", "e", request.fromDate, request.toDate), /paid/);
  const input = { tenantId: "t", id: "r", actorId: "reviewer", actorRole: "admin", approve: true, note: "Verified" };
  await assert.rejects(() => reviewLeaveCancellation(tx, { ...input, actorId: "e" }), /cannot review/);
  await assert.rejects(() => reviewLeaveCancellation(tx, { ...input, actorId: "maker" }), /cannot review/);
  await assert.rejects(() => reviewLeaveCancellation(tx, input), /paid/);
  assert.equal(request.status, "approved", "blocked cancellation retains leave");
  locked = false;
  await reviewLeaveCancellation(tx, input);
  assert.equal(request.status, "cancelled");
  assert.equal(request.cancellationRequestedBy, null);
  assert.equal(audit.length, 1);
  await assert.rejects(() => reviewLeaveCancellation(tx, input), /No pending/);

  const ledgerDb = {
    employee: { findFirst: async () => ({ locationId: "loc", branch: null }) },
    leavePolicyBalance: { findMany: async () => [{ leaveTypeId: "el", policyPeriodId: "p", entitlement: 4.5, carryForward: 2, policySnapshot: { rules: { unlimitedEntitlement: false } }, policyPeriod: { locationId: "loc", effectiveFrom: new Date("2026-01-01") } }] },
    leaveType: { findMany: async () => [{ id: "el", code: "EL", maxDays: 30, unlimitedEntitlement: false }] },
    leaveRequest: { findMany: async () => [{ leaveTypeId: "el", days: 1, leavePolicySnapshot: { policyPeriodId: "p" }, fromDate: new Date("2026-06-01") }, { leaveTypeId: "el", days: 20, leavePolicySnapshot: { policyPeriodId: "old" }, fromDate: new Date("2025-06-01") }] },
    leaveBalanceImportEntry: { findMany: async () => [{ leaveTypeId: "el", available: 100 }] },
  } as unknown as Prisma.TransactionClient;
  assert.equal((await encashableLeaveAt(ledgerDb, "t", "e", new Date("2026-10-05"))).days, 5.5, "current allocation wins over imports and old leave history");
  const settlement = computeFandF({ grossMonthly: 31000, resignationDate: new Date("2026-09-01"), lastWorkingDay: new Date("2026-10-31"), noticeDays: 0, loanOutstanding: 0, encashmentDays: 5.5 });
  assert.equal(settlement.encashmentDays, 5.5);
  assert.equal(settlement.encashmentAmount, 5500);
  assert.ok(canTransitionPayrollRun("reviewed", "draft"));
  assert.ok(canTransitionPayrollRun("approved", "draft"));
  assert.equal(canTransitionPayrollRun("finalized", "draft"), false);
  assert.equal(canTransitionPayrollRun("paid", "draft"), false);
  assert.equal(payrollRunTransitionData("draft", "admin").approvedAt, null);
  console.log("leave/payroll calendar, eligibility, source review, cancellation, encashment and reopen checks passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
