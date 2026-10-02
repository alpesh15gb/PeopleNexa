import assert from "node:assert/strict";
import {
  importedLeaveOpening,
  selectLeaveAllocation,
  calculateLeaveBalance,
} from "../lib/leave-balance";
import { earnedLeaveForPeriod } from "../lib/leave-accrual";
import { payrollLeaveDay } from "../lib/payroll-leave-day";
import {
  attendanceSummary,
  computePayroll,
  DEFAULT_PAYROLL_CONFIG,
  generatePayslipForEmployee,
  reverseLoanDeductionAllocations,
} from "../lib/payroll";
import { prisma } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";

async function main() {
  assert.equal(
    calculateLeaveBalance({
      cap: 12,
      opening: importedLeaveOpening(true, 8),
      credited: 0,
      used: 3,
      pending: 2,
    }).available,
    7,
    "policy allocation must not receive an imported top-up",
  );
  assert.equal(importedLeaveOpening(false, 8), 8);
  const allocations = [
    { leaveTypeId: "el", policyPeriod: { locationId: "other" } },
    { leaveTypeId: "el", policyPeriod: { locationId: null } },
    { leaveTypeId: "el", policyPeriod: { locationId: "own" } },
  ];
  assert.equal(selectLeaveAllocation(allocations, "el", "own"), allocations[2]);
  assert.equal(
    selectLeaveAllocation(allocations.slice(0, 2), "el", "own"),
    allocations[1],
  );
  assert.equal(
    selectLeaveAllocation(allocations.slice(0, 1), "el", "own"),
    undefined,
    "another location cannot supply a balance",
  );

  for (const paid of [true, false])
    for (const status of ["present", "late", "half_day", "absent", undefined]) {
      const day = payrollLeaveDay(0.5, true, paid, status);
      assert.equal(
        day.paidLeaveDays +
          day.unpaidLeaveDays +
          day.presentDays +
          day.lateDays +
          day.absentDays,
        1,
      );
      assert.equal(day.onLeaveDays, 0.5);
    }
  const rows = Array.from({ length: 31 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 30, 18, 30) + i * 86400000),
    status: "present",
    punchInTime: null,
    punchOutTime: null,
  }));
  let paid = false;
  const db = {
    attendance: { findMany: async () => rows },
    leaveRequest: {
      findMany: async () => [
        {
          fromDate: new Date("2026-10-01T00:00:00Z"),
          toDate: new Date("2026-10-01T00:00:00Z"),
          days: 0.5,
          leaveType: { paid },
          leavePolicySnapshot: { rules: { paid } },
        },
      ],
    },
    holiday: { findMany: async () => [] },
    rosterAssignment: { findMany: async () => [] },
  };
  const config = {
    ...DEFAULT_PAYROLL_CONFIG,
    salaryDivisorMethod: "calendar_days" as const,
    pf: { enabled: false, wageCeiling: 15000 },
    esic: { enabled: false, grossCeiling: 21000 },
    pt: { enabled: false, state: "" },
    lwf: { enabled: false },
    tds: { enabled: false, regime: "new" as const },
  };
  const summary = await attendanceSummary(
    "tenant",
    { id: "emp", shiftId: null },
    "2026-10",
    true,
    db as unknown as Prisma.TransactionClient,
  );
  assert.equal(summary.presentDays, 30.5);
  assert.equal(summary.unpaidLeaveDays, 0.5);
  assert.equal(
    computePayroll(config, { salary: 31000 }, summary, 0, "2026-10")
      .absentDeduction,
    500,
    "half-day unpaid leave deducts half the daily base",
  );
  paid = true;
  rows[0].status = "half_day";
  const paidSummary = await attendanceSummary(
    "tenant",
    { id: "emp", shiftId: null },
    "2026-10",
    true,
    db as unknown as Prisma.TransactionClient,
  );
  assert.equal(
    paidSummary.halfDays,
    0,
    "the worked half must not create an extra half-day absence",
  );
  assert.equal(
    computePayroll(config, { salary: 31000 }, paidSummary, 0, "2026-10")
      .absentDeduction,
    0,
  );
  rows[0].status = "absent";
  const absentSummary = await attendanceSummary(
    "tenant",
    { id: "emp", shiftId: null },
    "2026-10",
    true,
    db as unknown as Prisma.TransactionClient,
  );
  assert.equal(
    absentSummary.absentDays,
    0.5,
    "paid half-day leave does not cover absence in the other half",
  );

  const rule = {
    source: "attendance_status" as const,
    tiers: [
      { minDays: 0, maxDays: 13, daysEarned: 0 },
      { minDays: 14, maxDays: 31, daysEarned: 1 },
    ],
    joiningMonthClaimDeferral: "next_month" as const,
  };
  const worked = ["2026-08", "2026-09", "2026-10"].flatMap((month) =>
    Array.from({ length: 14 }, (_, i) => ({
      date: new Date(`${month}-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
      status: "present",
    })),
  );
  assert.equal(
    earnedLeaveForPeriod(
      rule,
      worked,
      null,
      new Date("2026-08-01"),
      null,
      new Date("2026-10-02"),
    ).entitlement,
    2,
    "accrual adds completed months and excludes future attendance",
  );
  assert.equal(
    earnedLeaveForPeriod(
      rule,
      worked,
      new Date("2026-08-01"),
      new Date("2026-08-01"),
      null,
      new Date("2026-08-31"),
    ).entitlement,
    0,
    "joining-month earnings remain deferred",
  );
  assert.equal(
    earnedLeaveForPeriod(
      rule,
      worked,
      new Date("2026-08-01"),
      new Date("2026-08-01"),
      null,
      new Date("2026-09-01"),
    ).entitlement,
    1,
  );
  assert.equal(
    earnedLeaveForPeriod(
      rule,
      worked,
      null,
      new Date("2026-08-01"),
      new Date("2026-08-31T23:59:59Z"),
      new Date("2026-10-02"),
    ).entitlement,
    1,
    "closed periods exclude subsequent months",
  );
  assert.deepEqual(
    reverseLoanDeductionAllocations(
      [
        { id: "a", outstanding: 900, lastDeductedMonth: "2026-10" },
        { id: "b", outstanding: 500, lastDeductedMonth: null },
      ],
      [{ id: "a", amount: 100 }],
      "2026-10",
    ),
    [{ id: "a", outstanding: 1000 }],
  );
  assert.equal(
    reverseLoanDeductionAllocations(
      [{ id: "a", outstanding: 800, lastDeductedMonth: "2026-11" }],
      [{ id: "a", amount: 100 }],
      "2026-10",
    ),
    null,
  );

  const original = prisma.$transaction;
  let stored: Record<string, any> | null = null;
  const tx = {
    ...db,
    leaveRequest: { findMany: async () => [] },
    payrollRun: { updateMany: async () => ({ count: 1 }) },
    payslip: {
      findUnique: async () => stored,
      create: async ({ data }: any) => {
        stored = { id: "slip", ...data };
        return stored;
      },
    },
    payrollRunMember: { create: async () => ({}) },
    employeeLoan: {
      findMany: async () => [],
      updateMany: async () => ({ count: 1 }),
    },
    payrollAdjustment: { findMany: async () => [] },
    taxDeclaration: { findUnique: async () => null },
    tenant: { findUnique: async () => null },
  };
  (prisma as any).$transaction = async (fn: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    return fn(tx);
  };
  try {
    const employee = {
      id: "emp",
      salary: 31000,
      shiftId: null,
      payMode: "monthly",
      salaryStructure: { basic: 10000 },
      workBasisRate: 100,
      pfAllowed: false,
    };
    const first = await generatePayslipForEmployee(
      "tenant",
      { payroll: config },
      employee,
      "2026-10",
      undefined,
      "run",
    );
    assert.equal(first.created, true);
    const snapshot = (stored as any).inputSnapshot;
    assert.equal(snapshot.employee.salaryStructure.basic, 10000);
    assert.equal(snapshot.employee.workBasisRate, 100);
    assert.equal(snapshot.statutory.pfAllowed, false);
    const duplicate = await generatePayslipForEmployee(
      "tenant",
      { payroll: config },
      employee,
      "2026-10",
      undefined,
      "run",
    );
    assert.equal(duplicate.created, false);
    assert.equal(
      duplicate.loanApplied,
      0,
      "duplicate generation reports no new deduction",
    );
  } finally {
    (prisma as any).$transaction = original;
  }
  console.log("Payroll and leave audit regression scenarios passed.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
