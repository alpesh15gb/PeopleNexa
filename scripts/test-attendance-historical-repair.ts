/** Destructive QA fixtures only: dedicated socket-only disposable database. */
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { prepareHistoricalRepair, applyHistoricalRepair, rollbackHistoricalRepair, repairHash, repairPlain } from "../lib/attendance-historical-repair";
import { verifyRecentAttendance } from "../lib/attendance-recent-verification";
import { reconcileEmployeeDay } from "../lib/reconcile";
import { createPunchForEvent } from "../lib/punch-idempotency";
import { processAttendanceReconcileJobs } from "../lib/attendance-reconcile-jobs";
import { parseIST } from "../lib/ist";
import { isAmbiguousPunchBurst } from "../lib/attendance-validation";

const at = (value: string) => parseIST(value)!;
const now = at("2026-10-26 18:00:00");
async function main() {
  assert.equal(process.env.ATTENDANCE_LAB, "isolated");
  assert.deepEqual(await prisma.$queryRaw`SELECT current_database() AS db, current_setting('listen_addresses') AS port`, [{ db: "peoplenexa_repair_20261026", port: "" }]);
  globalThis.fetch = async () => { throw new Error("External requests forbidden in repair QA"); };
  const tenant = await prisma.tenant.create({ data: { name: "Historical repair QA", slug: `repair-qa-${Date.now()}`, code: `RQA-${Date.now()}` } });
  const tenantId = tenant.id, checks: string[] = [];
  const check = (value: string) => { checks.push(value); console.log(`PASS ${value}`); };
  const device = await prisma.device.create({ data: { tenantId, name: "Repair QA device", serialNumber: `RQA-${tenantId}` } });
  const employee = async (code: string) => prisma.employee.create({ data: { tenantId, employeeNumber: `QA/${code}`, deviceCode: code, firstName: "Repair", lastName: "Fixture", joiningDate: at("2026-01-01 00:00:00") } });
  const scan = (employeeId: string, time: string, hint = "unknown") => prisma.punch.create({ data: { tenantId, employeeId, deviceId: device.id, source: "device", punchTime: at(time), inOutHint: hint, createdAt: at("2026-10-26 10:00:00") } });
  const selection = (id: string, day = "2026-10-06", sourceLogIds: string[] = []) => ({ tenantId, days: [{ employeeId: id, day }], sourceLogIds });
  const fixture = async (code: string) => {
    const e = await employee(code), a = await scan(e.id, "2026-10-05 08:00:00"), b = await scan(e.id, "2026-10-06 08:00:00");
    const old = await prisma.attendance.create({ data: { tenantId, employeeId: e.id, date: at("2026-10-05 00:00:00"), status: "present", finalized: true, reviewStatus: "needs_review", punchInTime: a.punchTime, punchOutTime: b.punchTime, punches: [a, b].map(p => ({ id: p.id, time: p.punchTime.toISOString(), type: "auto", source: "device" })) } });
    return { e, a, b, old };
  };
  const rows = (employeeId: string) => prisma.attendance.findMany({ where: { employeeId }, orderBy: { date: "asc" } });
  const rawLog = async (code: string, time: string) => prisma.deviceLog.create({ data: { tenantId, deviceId: device.id, userId: code, punchTime: at(time), processed: true, error: `No active employee with device code "${code}" in this workspace`, rawData: JSON.stringify({ EmployeeCode: code, SerialNumber: device.serialNumber, LogDate: time, Direction: "INOUT", VerificationType: "Finger" }) } });
  try {
    const f = await fixture("004");
    const untouched = await rows(f.e.id);
    const m = await prepareHistoricalRepair(selection(f.e.id), now);
    assert.equal(m.components.length, 1); assert.deepEqual(m.components[0].days, ["2026-10-05", "2026-10-06"]); assert.deepEqual(m.components[0].blocked, []);
    assert.deepEqual(await rows(f.e.id), untouched);
    check("read-only preview follows the missing day and its linked previous record");
    await assert.rejects(applyHistoricalRepair(m, "wrong"), /hash/);
    const tampered = repairPlain(m); tampered.components[0].proposed[0].status = "absent";
    await assert.rejects(applyHistoricalRepair(tampered, m.hash), /hash/);
    check("wrong and edited manifests cannot write");

    // Arrival from yesterday/today after the preview must remain live and intact.
    for (const time of ["2026-10-25 08:00:00", "2026-10-26 08:00:00"]) {
      await createPunchForEvent({ tenantId, employeeId: f.e.id, deviceId: device.id, source: "device", punchTime: at(time), eventKey: `qa-recent:${time}` });
    }
    await processAttendanceReconcileJobs(tenantId);
    const recentBefore = await prisma.attendance.findMany({ where: { employeeId: f.e.id, date: { gte: at("2026-10-25 00:00:00") } }, orderBy: { date: "asc" } });
    const applied = await applyHistoricalRepair(m, m.hash, 25, now);
    assert.equal(applied[0].status, "applied_review_only");
    assert.deepEqual(await prisma.attendance.findMany({ where: { employeeId: f.e.id, date: { gte: at("2026-10-25 00:00:00") } }, orderBy: { date: "asc" } }), recentBefore);
    const repaired = await prisma.attendance.findMany({ where: { employeeId: f.e.id, date: { lt: at("2026-10-25 00:00:00") } }, orderBy: { date: "asc" } });
    assert.equal(repaired.length, 2); assert.equal(repaired[0].id, f.old.id);
    assert.ok(repaired.every(r => r.reviewStatus === "needs_review" && r.finalized && r.overtimeMinutes === 0));
    assert.equal(new Set(repaired.flatMap(r => (r.punches as any[]).map(p => p.id))).size, 2);
    check("old repair preserves yesterday/today records, ledger evidence and original IDs");
    assert.equal((await applyHistoricalRepair(m, m.hash, 25, now))[0].status, "already_applied");
    const undo = await rollbackHistoricalRepair(m, m.hash);
    assert.equal(undo[0].status, "attendance_rolled_back_evidence_retained");
    const restored = await prisma.attendance.findUniqueOrThrow({ where: { id: f.old.id } });
    assert.equal(restored.punchOutTime?.getTime(), f.old.punchOutTime?.getTime());
    assert.deepEqual(restored.punches, f.old.punches);
    assert.equal((await rows(f.e.id)).length, 3);
    assert.equal((await rollbackHistoricalRepair(m, m.hash))[0].status, "already_rolled_back");
    check("apply and guarded rollback are idempotent and leave recent attendance intact");

    const stale = await fixture("STALE"), sm = await prepareHistoricalRepair(selection(stale.e.id), now);
    await scan(stale.e.id, "2026-10-06 17:00:00");
    assert.equal((await applyHistoricalRepair(sm, sm.hash, 25, now))[0].status, "skipped");
    assert.equal((await rows(stale.e.id)).length, 1);
    check("new historical punch after preview invalidates the entire connected group");

    const manual = await fixture("MANUAL"), mm = await prepareHistoricalRepair(selection(manual.e.id), now);
    const decision = await prisma.attendance.update({ where: { id: manual.old.id }, data: { reviewStatus: "manual_override", status: "absent", finalized: false } });
    assert.equal((await applyHistoricalRepair(mm, mm.hash, 25, now))[0].status, "skipped");
    assert.equal((await reconcileEmployeeDay(tenant, manual.e, at("2026-10-05 00:00:00"), { finalize: true })).protected, true);
    assert.deepEqual(await prisma.attendance.findUnique({ where: { id: decision.id } }), decision);
    const mm2 = await prepareHistoricalRepair(selection(manual.e.id), now);
    assert.ok(mm2.components[0].blocked.some(b => b.includes("Manual")));
    check("manual decisions are protected before/after preview, even when not finalized");

    const paid = await fixture("PAID"), pm = await prepareHistoricalRepair(selection(paid.e.id), now);
    const run = await prisma.payrollRun.create({ data: { tenantId, month: "2026-10", status: "reviewed", scopeKey: "qa", createdBy: "qa", members: { create: { employeeId: paid.e.id, inputSnapshot: {} } } } });
    assert.equal((await applyHistoricalRepair(pm, pm.hash, 25, now))[0].status, "skipped");
    assert.equal((await rows(paid.e.id)).length, 1);
    await prisma.payrollRun.delete({ where: { id: run.id } });
    const slip = await prisma.payslip.create({ data: { tenantId, employeeId: paid.e.id, month: "2026-10", status: "paid", baseSalary: 1, netSalary: 1, deductions: 0 } });
    assert.ok((await prepareHistoricalRepair(selection(paid.e.id), now)).components[0].blocked.some(b => b.includes("payslip")));
    await prisma.payslip.delete({ where: { id: slip.id } });
    check("new payroll locks and legacy paid payslips block historical changes");

    const changed = await fixture("CONTEXT"), cm = await prepareHistoricalRepair(selection(changed.e.id), now);
    await prisma.employee.update({ where: { id: changed.e.id }, data: { status: "inactive" } });
    assert.equal((await applyHistoricalRepair(cm, cm.hash, 25, now))[0].status, "skipped");
    const future = await fixture("FUTURE");
    await prisma.employee.update({ where: { id: future.e.id }, data: { joiningDate: at("2055-12-10 00:00:00") } });
    assert.ok((await prepareHistoricalRepair(selection(future.e.id), now)).components[0].blocked.some(b => b.includes("joining")));
    check("employee changes and invalid joining dates cannot be silently repaired");

    const night = await fixture("NIGHT");
    const nightShift = await prisma.shift.create({ data: { tenantId, name: "QA night", startTime: "22:00", endTime: "06:00", isNightShift: true } });
    await prisma.employee.update({ where: { id: night.e.id }, data: { shiftId: nightShift.id } });
    const nightManifest = await prepareHistoricalRepair(selection(night.e.id), now);
    assert.ok(nightManifest.components[0].blocked.some(b => b.includes("night shift")));
    const boundary = await fixture("BOUNDARY"), bm = await prepareHistoricalRepair(selection(boundary.e.id), now);
    const live = await prisma.attendance.create({ data: { tenantId, employeeId: boundary.e.id, date: at("2026-10-25 00:00:00"), status: "present", punches: [{ id: boundary.b.id, time: boundary.b.punchTime.toISOString(), type: "auto", source: "device" }] } });
    assert.equal((await applyHistoricalRepair(bm, bm.hash, 25, now))[0].status, "skipped");
    assert.deepEqual(await prisma.attendance.findUnique({ where: { id: live.id } }), live);
    check("configured night duty and new links to live dates cannot be calendar-day rewritten");

    const recovering = await employee("0007"), raw = await rawLog("0007", "2026-10-01 09:00:00");
    const rm = await prepareHistoricalRepair({ tenantId, days: [], sourceLogIds: [raw.id] }, now);
    const employeeBefore = await prisma.employee.findUnique({ where: { id: recovering.id } });
    const recovered = await applyHistoricalRepair(rm, rm.hash, 25, now);
    assert.equal(recovered[0].recoveredEvents, 1);
    const ledger = await prisma.punch.findUniqueOrThrow({ where: { eventKey: `device-log:${raw.id}` } });
    assert.equal(ledger.employeeId, recovering.id); assert.equal(+ledger.punchTime, +raw.punchTime!); assert.equal(ledger.deviceId, device.id);
    assert.equal((await prisma.attendanceReconcileJob.findUniqueOrThrow({ where: { punchId: ledger.id } })).status, "blocked");
    assert.deepEqual(await prisma.employee.findUnique({ where: { id: recovering.id } }), employeeBefore);
    assert.equal((await prisma.deviceLog.findUniqueOrThrow({ where: { id: raw.id } })).rawData, raw.rawData);
    const recoveryAudit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, entityId: rm.components[0].id } });
    assert.equal((recoveryAudit.before as any).state.logs[0].error, raw.error);
    assert.equal((await rows(recovering.id))[0].reviewStatus, "needs_review");
    await rollbackHistoricalRepair(rm, rm.hash);
    assert.ok(await prisma.punch.findUnique({ where: { id: ledger.id } }));
    assert.equal((await rows(recovering.id)).length, 0);
    check("exact leading-zero event recovery is atomic, audited and retained on attendance rollback");

    const fault = await employee("FAULT"), faultRaw = await rawLog("FAULT", "2026-10-01 09:05:00");
    const fm = await prepareHistoricalRepair({ tenantId, days: [], sourceLogIds: [faultRaw.id] }, now);
    await prisma.$executeRawUnsafe("CREATE FUNCTION pg_temp.fail_historical_repair() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected historical attendance failure'; END $$");
    await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_historical_fail BEFORE INSERT ON "Attendance" FOR EACH ROW WHEN (NEW."employeeId" = '${fault.id}') EXECUTE FUNCTION pg_temp.fail_historical_repair()`);
    try {
      assert.equal((await applyHistoricalRepair(fm, fm.hash, 25, now))[0].status, "failed");
      assert.equal(await prisma.punch.count({ where: { employeeId: fault.id } }), 0);
      assert.equal((await prisma.deviceLog.findUniqueOrThrow({ where: { id: faultRaw.id } })).error, faultRaw.error);
      assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: fm.components[0].id } }), 0);
    } finally { await prisma.$executeRawUnsafe('DROP TRIGGER qa_historical_fail ON "Attendance"'); }
    check("failure after recovered Punch/job insertion rolls back the whole component");

    const wrong = await employee("BAD"), bad = await rawLog("BAD", "2026-10-01 09:00:00");
    await prisma.deviceLog.update({ where: { id: bad.id }, data: { rawData: JSON.stringify({ EmployeeCode: "BAD", SerialNumber: "OTHER", LogDate: "2026-10-01 09:00:00" }) } });
    assert.ok((await prepareHistoricalRepair({ tenantId, days: [], sourceLogIds: [bad.id] }, now)).components[0].blocked.some(b => b.includes("mismatch")));
    const duplicate = await employee("DUP"), duplicateRaw = await rawLog("DUP", "2026-10-01 09:30:00");
    await scan(duplicate.id, "2026-10-01 09:30:00");
    assert.ok((await prepareHistoricalRepair({ tenantId, days: [], sourceLogIds: [duplicateRaw.id] }, now)).components[0].blocked.some(b => b.includes("represented")));
    await assert.rejects(prepareHistoricalRepair({ tenantId: "wrong-tenant", days: [{ employeeId: wrong.id, day: "2026-10-01" }], sourceLogIds: [] }, now), /outside/);
    check("wrong serial, conflicting existing scan and cross-tenant selection fail closed");

    const recent = await employee("RECENT"), recentRaw = await rawLog("RECENT", "2026-10-25 08:00:00");
    const recentPlan = await prepareHistoricalRepair({ tenantId, days: [], sourceLogIds: [recentRaw.id] }, now);
    assert.ok(recentPlan.components[0].blocked.some(b => b.includes("Yesterday")));
    assert.equal((await applyHistoricalRepair(recentPlan, recentPlan.hash, 25, now))[0].status, "held");
    assert.equal(await prisma.punch.count({ where: { employeeId: recent.id } }), 0);
    check("yesterday/today source events and attendance are excluded from historical writes");

    const rollbackConflict = await fixture("UNDO"), um = await prepareHistoricalRepair(selection(rollbackConflict.e.id), now);
    await applyHistoricalRepair(um, um.hash, 25, now);
    const beforeConflict = await rows(rollbackConflict.e.id);
    const newer = await scan(rollbackConflict.e.id, "2026-10-06 18:00:00");
    assert.equal((await rollbackHistoricalRepair(um, um.hash))[0].status, "skipped");
    assert.deepEqual(await rows(rollbackConflict.e.id), beforeConflict);
    assert.ok(await prisma.punch.findUnique({ where: { id: newer.id } }));
    check("rollback refuses to overwrite newer evidence or decisions");

    const burst = await employee("BURST");
    await scan(burst.id, "2026-10-20 09:00:00"); await scan(burst.id, "2026-10-20 09:00:03");
    for (const finalize of [false, true]) assert.equal((await reconcileEmployeeDay(tenant, burst, at("2026-10-20 00:00:00"), { finalize })).reviewStatus, "needs_review");
    const directed = await employee("DIRECTED");
    await scan(directed.id, "2026-10-20 09:00:00", "in"); await scan(directed.id, "2026-10-20 09:00:03", "out");
    assert.equal((await reconcileEmployeeDay(tenant, directed, at("2026-10-20 00:00:00"), { finalize: true })).reviewStatus, null);
    check("undirected repeated bursts require review; explicit short IN/OUT keeps existing policy");
    assert.equal(isAmbiguousPunchBurst([{ inOutHint: "in", punchTime: at("2026-10-20 09:00:00") }, { inOutHint: "unknown", punchTime: at("2026-10-20 09:00:03") }]), true, "One direction alone must not make a repeated scan a complete pair");

    // Simultaneous repair and fresh arrival use separate DB connections.
    const concurrent = await fixture("CONCURRENT"), qm = await prepareHistoricalRepair(selection(concurrent.e.id), now);
    let entered!: () => void, release!: () => void;
    const writing = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const originalTransaction = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = (callback: any, options: any) => originalTransaction(async db => callback(new Proxy(db, { get(target, key) {
      if (key !== "attendance") return Reflect.get(target, key);
      return new Proxy(target.attendance, { get(delegate, method) {
        if (method !== "updateMany") return Reflect.get(delegate, method);
        return async (args: any) => { if (args.where.id === concurrent.old.id) { entered(); await resume; } return delegate.updateMany(args); };
      } });
    } })), options);
    let repairResult: any, arrival: any;
    try {
      const running = applyHistoricalRepair(qm, qm.hash, 25, now);
      await writing;
      arrival = await createPunchForEvent({ tenantId, employeeId: concurrent.e.id, deviceId: device.id, source: "device", eventKey: "qa-during-repair", punchTime: at("2026-10-26 10:00:00") });
      release(); repairResult = await running;
    } finally { release(); prisma.$transaction = originalTransaction; }
    assert.equal(repairResult[0].status, "applied_review_only");
    await processAttendanceReconcileJobs(tenantId);
    assert.ok(await prisma.punch.findUnique({ where: { id: arrival.punch.id } }));
    assert.ok(await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: concurrent.e.id, date: at("2026-10-26 00:00:00") } } }));
    check("concurrent fresh arrival survives historical repair and reconciles normally");
    const recentAudit = await verifyRecentAttendance(tenantId, "2026-10-25", now);
    assert.ok(recentAudit.summary.normalizedPunches >= 3); assert.equal(recentAudit.mode, "read_only");
    assert.ok(recentAudit.rawIssues.some(r => r.sourceId === recentRaw.id));
    assert.ok(!recentAudit.unprojected.some(p => [concurrent.a.id, concurrent.b.id].includes(p.punchId)), "Recently received older punches must be checked against their historical projection dates");
    assert.equal(await prisma.deviceLog.count({ where: { id: recentRaw.id } }), 1);
    check("recent receipt-to-ledger-to-projection audit reports unresolved sources without changing them");
    console.log(JSON.stringify({ status: "passed", checks: checks.length, scenarios: checks }));
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS qa_historical_fail ON "Attendance"');
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.payrollRun.deleteMany({ where: { tenantId } });
    await prisma.punch.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
