/** Run ONLY in a disposable, network-isolated attendance lab. See the audit runbook. */
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { createPunchForEvent } from "../lib/punch-idempotency";
import { processAttendanceReconcileJobs } from "../lib/attendance-reconcile-jobs";
import { handleDevicePunch, reprocessFailedLogs } from "../lib/iclock";
import { handleRealtimePunch } from "../lib/realtime-devices";
import { reconcileEmployeeDay, finalizeEligibleDays } from "../lib/reconcile";
import { employeeLocationScope } from "../lib/location-scope";
import { parseIST } from "../lib/ist";

async function main() {
  assert.equal(process.env.ATTENDANCE_LAB, "isolated", "Explicit lab acknowledgement required");
  const identity = await prisma.$queryRaw<Array<{ db: string; port: string }>>`SELECT current_database() AS db, current_setting('listen_addresses') AS port`;
  assert.deepEqual(identity, [{ db: "peoplenexa_working", port: "" }], "Refuse any other database or TCP-enabled server");
  globalThis.fetch = async () => { throw new Error("External requests forbidden in attendance integration tests"); };
  const tenant = await prisma.tenant.create({ data: { name: "Attendance regression fixture", slug: `attendance-qa-${Date.now()}`, code: `QA-${Date.now()}` } });
  const tenantId = tenant.id;
  const day = parseIST("2026-10-20 00:00:00")!;
  const at = (clock: string) => parseIST(`2026-10-20 ${clock}`)!;
  let checks = 0;
  const check = (name: string) => { checks++; console.log(`PASS ${name}`); };
  try {
    const employee = await prisma.employee.create({ data: { tenantId, employeeNumber: "QA/004", deviceCode: "004", firstName: "Attendance", lastName: "Fixture" } });
    const device = await prisma.device.create({ data: { tenantId, name: "QA device", serialNumber: `QA-${tenantId}` } });
    const realtime = await prisma.realtimeDevice.create({ data: { tenantId, name: "QA realtime", apiKey: `qa-${tenantId}`, serialNumber: `RT-${tenantId}` } });
    const event = (key: string, clock: string, authStatus = "auto") => ({ tenantId, employeeId: employee.id, eventKey: key, punchTime: at(clock), source: "device", inOutHint: "unknown", authStatus });
    const row = () => prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: employee.id, date: day } } });
    const drain = async () => {
      await prisma.attendanceReconcileJob.updateMany({ where: { tenantId, status: { in: ["pending", "failed", "processing"] } }, data: { nextAttemptAt: new Date(0) } });
      return processAttendanceReconcileJobs(tenantId, 100);
    };

    // Inject a database-side failure after Punch insertion: both records must roll back.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION pg_temp.fail_qa_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_fail_outbox BEFORE INSERT ON "AttendanceReconcileJob" FOR EACH ROW WHEN (NEW."tenantId" = '${tenantId}') EXECUTE FUNCTION pg_temp.fail_qa_job()`);
    await assert.rejects(createPunchForEvent(event("qa-atomic-failure", "08:00:00")));
    assert.equal(await prisma.punch.count({ where: { tenantId } }), 0);
    await prisma.$executeRawUnsafe('DROP TRIGGER qa_fail_outbox ON "AttendanceReconcileJob"');
    check("punch and recovery job are committed atomically");

    const log = await prisma.deviceLog.create({ data: { tenantId, deviceId: device.id, userId: "004", punchTime: at("08:00:00"), rawData: "QA retained evidence" } });
    await createPunchForEvent({ ...event(`device-log:${log.id}`, "08:00:00"), deviceId: device.id });
    assert.equal(await row(), null, "Reproduce interruption after normalized punch, before attendance");
    await handleDevicePunch(device, { userId: "004", punchTime: at("08:00:00"), rawLine: "retry" });
    assert.ok(await row(), "Duplicate event must still reconcile");
    assert.equal(await prisma.punch.count({ where: { eventKey: `device-log:${log.id}` } }), 1);
    assert.equal((await prisma.deviceLog.findUniqueOrThrow({ where: { id: log.id } })).processed, true);
    check("device retry heals interrupted attendance without duplicate punches");

    const rtLog = await prisma.realtimeLog.create({ data: { tenantId, realtimeDeviceId: realtime.id, userId: "004", punchTime: at("17:00:00"), rawData: "QA retained RT evidence" } });
    await createPunchForEvent({ ...event(`realtime-log:${rtLog.id}`, "17:00:00"), realtimeDeviceId: realtime.id });
    await handleRealtimePunch(realtime, { userId: "004", punchTime: at("17:00:00"), rawLine: "retry" });
    assert.equal((await row())?.punchOutTime?.getTime(), at("17:00:00").getTime());
    assert.equal(await prisma.punch.count({ where: { tenantId } }), 2);
    check("realtime retry heals the existing event and retains a correct pair");

    // Two independent workers contend for the same jobs; leases and serializable
    // reconciliation prevent an older calculation overwriting the last OUT.
    await Promise.all([createPunchForEvent(event("qa-concurrent-1", "17:05:00")), createPunchForEvent(event("qa-concurrent-2", "17:10:00"))]);
    await Promise.all([processAttendanceReconcileJobs(tenantId), processAttendanceReconcileJobs(tenantId)]);
    await drain();
    assert.equal((await row())?.punchOutTime?.getTime(), at("17:10:00").getTime());
    assert.equal(await prisma.attendance.count({ where: { tenantId } }), 1);
    assert.equal(await prisma.attendanceReconcileJob.count({ where: { tenantId, status: { not: "done" } } }), 0);
    check("concurrent events/workers converge to one attendance row with latest OUT");

    const { punch } = await createPunchForEvent(event("qa-lease", "17:15:00"));
    await prisma.attendanceReconcileJob.update({ where: { punchId: punch.id }, data: { status: "processing", nextAttemptAt: new Date(0) } });
    await processAttendanceReconcileJobs(tenantId);
    assert.equal((await prisma.attendanceReconcileJob.findUniqueOrThrow({ where: { punchId: punch.id } })).status, "done");
    check("expired worker lease is reclaimed after an interruption");

    const other = await prisma.employee.create({ data: { tenantId, employeeNumber: "QA/OTHER", firstName: "Other", lastName: "Fixture" } });
    await assert.rejects(createPunchForEvent({ ...event("qa-lease", "17:15:00"), employeeId: other.id }), /different employee or workspace/);
    check("event identity cannot be reassigned to another employee");

    const held = await createPunchForEvent({ ...event("qa-held", "09:00:00", "pending"), employeeId: other.id, source: "mobile" });
    await drain();
    assert.equal(await prisma.attendance.count({ where: { employeeId: other.id } }), 0);
    assert.equal((await prisma.attendanceReconcileJob.findUniqueOrThrow({ where: { punchId: held.punch.id } })).status, "blocked");
    await prisma.$transaction(async tx => {
      await tx.punch.update({ where: { id: held.punch.id }, data: { authStatus: "approved" } });
      await tx.attendanceReconcileJob.update({ where: { punchId: held.punch.id }, data: { status: "pending", version: { increment: 1 }, nextAttemptAt: new Date(0) } });
    });
    await drain();
    assert.equal(await prisma.attendance.count({ where: { employeeId: other.id } }), 1);
    await prisma.$transaction(async tx => {
      await tx.punch.update({ where: { id: held.punch.id }, data: { authStatus: "declined" } });
      await tx.attendanceReconcileJob.update({ where: { punchId: held.punch.id }, data: { status: "pending", version: { increment: 1 }, nextAttemptAt: new Date(0) } });
    });
    await drain();
    assert.equal(await prisma.attendance.count({ where: { employeeId: other.id } }), 0);
    assert.ok(await prisma.punch.findUnique({ where: { id: held.punch.id } }), "Declined evidence is retained");
    check("held/approved/declined mobile evidence follows authorization without leaking attendance");

    const failedEvent = await createPunchForEvent(event("qa-retry-failure", "17:20:00"));
    await prisma.attendanceReconcileJob.update({ where: { punchId: failedEvent.punch.id }, data: { employeeId: other.id } });
    await drain();
    const failedJob = await prisma.attendanceReconcileJob.findUniqueOrThrow({ where: { punchId: failedEvent.punch.id } });
    assert.equal(failedJob.status, "failed");
    assert.match(failedJob.lastError!, /scope mismatch/);
    await prisma.attendanceReconcileJob.update({ where: { id: failedJob.id }, data: { employeeId: employee.id, nextAttemptAt: new Date(0) } });
    await processAttendanceReconcileJobs(tenantId);
    assert.equal((await prisma.attendanceReconcileJob.findUniqueOrThrow({ where: { id: failedJob.id } })).status, "done");
    check("failed work persists a readable reason and can recover on a later attempt");

    const generation = await createPunchForEvent(event("qa-generation", "17:22:00"));
    const findTenant = prisma.tenant.findUniqueOrThrow.bind(prisma.tenant);
    let interrupted = false;
    prisma.tenant.findUniqueOrThrow = (async (args: any) => {
      if (!interrupted) {
        interrupted = true;
        await prisma.attendanceReconcileJob.update({ where: { punchId: generation.punch.id }, data: { status: "pending", version: { increment: 1 }, nextAttemptAt: new Date(0) } });
      }
      return findTenant(args);
    }) as unknown as typeof prisma.tenant.findUniqueOrThrow;
    try { await processAttendanceReconcileJobs(tenantId); } finally { prisma.tenant.findUniqueOrThrow = findTenant; }
    assert.equal((await prisma.attendanceReconcileJob.findUniqueOrThrow({ where: { punchId: generation.punch.id } })).status, "pending");
    await processAttendanceReconcileJobs(tenantId);
    assert.equal((await prisma.attendanceReconcileJob.findUniqueOrThrow({ where: { punchId: generation.punch.id } })).status, "done");
    check("stale worker acknowledgement cannot consume a newer authorization generation");

    const current = await row();
    const manual = await prisma.attendance.update({ where: { id: current!.id }, data: { status: "absent", finalized: true, reviewStatus: "manual_override", note: "QA manual decision" } });
    await createPunchForEvent(event("qa-after-finalized", "17:30:00"));
    await drain();
    assert.deepEqual(await row(), manual, "Manual finalized row must remain byte-for-byte unchanged");
    assert.equal(await prisma.attendanceReconcileJob.count({ where: { tenantId, status: "blocked" } }), 1);
    check("new evidence cannot overwrite a finalized manual decision");

    const run = await prisma.payrollRun.create({ data: { tenantId, month: "2026-10", status: "paid", scopeKey: "tenant", createdBy: "qa", members: { create: { employeeId: other.id, inputSnapshot: {} } } } });
    await createPunchForEvent({ ...event("qa-paid", "10:00:00"), employeeId: other.id });
    await drain();
    assert.equal(await prisma.attendance.count({ where: { employeeId: other.id } }), 0);
    const protectedResult = await reconcileEmployeeDay(tenant, other, day, { finalize: true });
    assert.equal(protectedResult.protected, true);
    assert.equal((await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status, "paid");
    check("paid payroll blocks both worker and explicit finalization writes");

    const third = await prisma.employee.create({ data: { tenantId, employeeNumber: "QA/FINALIZE", firstName: "Finalize", lastName: "Fixture" } });
    const oldDay = parseIST("2026-10-01 00:00:00")!;
    const paidOpen = await prisma.attendance.create({ data: { tenantId, employeeId: other.id, date: oldDay, status: "present", punchInTime: parseIST("2026-10-01 08:00:00") } });
    await createPunchForEvent({ ...event("qa-finalize-in", "08:00:00"), employeeId: third.id });
    await createPunchForEvent({ ...event("qa-finalize-out", "17:00:00"), employeeId: third.id });
    await reconcileEmployeeDay(tenant, third, day);
    assert.equal(await finalizeEligibleDays(tenantId, 1), 1);
    assert.equal((await prisma.attendance.findUniqueOrThrow({ where: { employeeId_date: { employeeId: third.id, date: day } } })).finalized, true);
    assert.deepEqual(await prisma.attendance.findUnique({ where: { id: paidOpen.id } }), paidOpen);
    check("old payroll-protected rows cannot starve the bounded finalization queue");
    const legacy = await prisma.payslip.create({ data: { tenantId, employeeId: third.id, month: "2026-09", baseSalary: 100, deductions: 0, netSalary: 100, status: "paid" } });
    assert.equal((await reconcileEmployeeDay(tenant, third, parseIST("2026-09-20 00:00:00")!, { finalize: true })).protected, true);
    assert.equal((await prisma.payslip.findUniqueOrThrow({ where: { id: legacy.id } })).status, "paid");
    check("legacy paid payslips are protected even without a payroll run");

    // A code like 004 must not be coerced to 4; inactive employees stay inactive.
    await prisma.deviceLog.create({ data: { tenantId, deviceId: device.id, userId: "4", punchTime: at("11:00:00"), rawData: "unmatched code", error: "unmapped" } });
    const inactive = await prisma.employee.create({ data: { tenantId, employeeNumber: "QA/INACTIVE", deviceCode: "005", firstName: "Inactive", lastName: "Fixture", status: "inactive" } });
    await prisma.deviceLog.create({ data: { tenantId, deviceId: device.id, userId: "005", punchTime: at("11:00:00"), rawData: "inactive", error: "unmapped" } });
    await reprocessFailedLogs(tenantId, 100, { includeHistorical: true });
    assert.equal(await prisma.punch.count({ where: { employeeId: inactive.id } }), 0);
    assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: inactive.id } })).status, "inactive");
    assert.equal(await prisma.deviceLog.count({ where: { tenantId, userId: "4", processed: false } }), 1);
    check("exact codes and inactive employee status survive recovery");

    const location = await prisma.location.create({ data: { tenantId, name: "QA location", code: "LOC" } });
    await prisma.employee.update({ where: { id: employee.id }, data: { locationId: location.id } });
    const scoped = await prisma.employee.findMany({ where: { tenantId, ...employeeLocationScope(location.id) }, select: { id: true } });
    assert.deepEqual(scoped, [{ id: employee.id }]);
    check("location scope includes its branchless employee and excludes unassigned staff");
    const stress = await prisma.employee.createManyAndReturn({ data: Array.from({ length: 24 }, (_, i) => ({ tenantId, employeeNumber: `QA/STRESS-${i}`, firstName: "Concurrent", lastName: "Fixture" })) });
    await prisma.punch.createMany({ data: stress.flatMap(e => ["08:00:00", "17:00:00"].map(clock => ({ tenantId, employeeId: e.id, source: "device", punchTime: at(clock), inOutHint: "unknown" }))) });
    const stressStart = Date.now();
    const stressResults = await Promise.allSettled(stress.map(async e => {
      for (let retry = 0; ; retry++) {
        try { await reconcileEmployeeDay(tenant, e, day); return; }
        catch (error) { if ((error as { code?: string }).code !== "P2034" || retry >= 5) throw error; }
      }
    }));
    assert.equal(stressResults.filter(r => r.status === "rejected").length, 0, JSON.stringify(stressResults.filter(r => r.status === "rejected")));
    assert.equal(await prisma.attendance.count({ where: { employeeId: { in: stress.map(e => e.id) }, punchOutTime: at("17:00:00") } }), 24);
    check(`24 simultaneous employee calculations complete without pool starvation (${Date.now() - stressStart}ms locally)`);
    console.log(JSON.stringify({ checks, status: "passed", database: identity[0].db }));
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS qa_fail_outbox ON "AttendanceReconcileJob"');
    await prisma.payrollRun.deleteMany({ where: { tenantId } });
    await prisma.punch.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
