import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { parseIST } from "../lib/ist";
import { repairCrossDayAttendance } from "./repair-cross-day-attendance";
const date = parseIST("2026-08-01 00:00:00")!;
const makeRow = (id: string) => ({ id, employeeId: id, tenantId: "t", date, updatedAt: date, branchId: null, shiftId: null, punchInTime: parseIST("2026-08-01 08:00:00")!, punchOutTime: parseIST("2026-08-02 07:59:00")!, overtimeMinutes: 100, reviewStatus: "needs_review", note: "old", punches: [], employee: { employeeNumber: id } });
let writes = 0, audits = 0;
let expectedLocation: string | undefined;
(prisma.location as any).findMany = async (args: any) => {
  assert.equal(args.where.tenantId, "t");
  assert.equal(args.where.OR[1].code, "HO");
  return [{ id: "ho-location", name: "Head Office", code: "HO" }];
};
(prisma.tenant as any).findMany = async () => [{ id: "t" }];
(prisma.attendance as any).findMany = async (args: any) => {
  assert.equal(args.where.tenantId, "t");
  assert.deepEqual(args.where.branch, expectedLocation ? { is: { tenantId: "t", locationId: expectedLocation } } : undefined);
  assert.equal(args.where.date.gte.toISOString(), parseIST("2026-08-01 00:00:00")!.toISOString());
  assert.equal(args.where.date.lt.toISOString(), parseIST("2026-11-01 00:00:00")!.toISOString());
  return [makeRow("eligible"), makeRow("locked"), makeRow("night")];
};
const roster = { count: async (args: any) => args.where.employeeId === "night" ? 1 : 0 };
(prisma.rosterAssignment as any).count = roster.count;
(prisma as any).$transaction = async (work: any) => work({
  rosterAssignment: roster,
  payrollRun: { findFirst: async (args: any) => args.where.OR[0].members.some.employeeId === "locked" ? { month: "2026-08", status: "paid" } : null },
  attendance: { updateMany: async (args: any) => {
    assert.equal(args.where.id, "eligible");
    assert.equal(args.where.updatedAt, date);
    assert.deepEqual(args.where.branch, expectedLocation ? { is: { tenantId: "t", locationId: expectedLocation } } : undefined);
    assert.equal(args.data.punchOutTime, null);
    assert.equal(args.data.reviewStatus, "missed_punch");
    writes++; return { count: 1 };
  } },
  auditLog: { create: async (args: any) => { assert.equal(args.data.before.punchOutTime, makeRow("eligible").punchOutTime.toISOString()); audits++; } },
});
async function main() {
  const preview = await repairCrossDayAttendance(["t", "2026-08", "2026-10"]);
  assert.equal(writes, 0, "preview never writes attendance");
  assert.equal(preview?.locked, 1);
  const applied = await repairCrossDayAttendance(["t", "2026-08", "2026-10", "--apply"]);
  assert.equal(applied?.updated, 1);
  assert.equal(applied?.locked, 1);
  assert.equal(applied?.skippedShift, 1);
  assert.equal(audits, 1, "each applied repair keeps a before/after audit");
  expectedLocation = "ho-location";
  await repairCrossDayAttendance(["t", "2026-08", "2026-10", "--location", "HO"]);
  assert.equal(writes, 1, "location preview never writes");
  await repairCrossDayAttendance(["t", "2026-08", "2026-10", "--location", "HO", "--apply"]);
  assert.equal(writes, 2);
  (prisma.location as any).findMany = async () => [];
  await assert.rejects(repairCrossDayAttendance(["t", "2026-08", "2026-10", "--location", "HO", "--apply"]), /exactly one location/);
  assert.equal(writes, 2, "unresolved location must never broaden the repair scope");
  console.log("cross-day repair safety tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
