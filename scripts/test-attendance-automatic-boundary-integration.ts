/** Run only against the existing disposable, network-isolated attendance lab. */
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { attendanceDayForPunch, reconcileEmployeeDay } from "../lib/reconcile";
import { assessmentRequiresReview } from "../lib/attendance-assessment";
import { parseIST } from "../lib/ist";

async function main() {
  assert.equal(process.env.ATTENDANCE_LAB, "isolated");
  assert.deepEqual(await prisma.$queryRaw`SELECT current_database() AS db, current_setting('listen_addresses') AS listen`, [{ db: "peoplenexa_working", listen: "" }]);
  globalThis.fetch = async () => { throw new Error("External requests forbidden in attendance integration tests"); };
  const tenant = await prisma.tenant.create({ data: { name: "Automatic boundary regression", slug: `automatic-boundary-${Date.now()}`, code: `AB-${Date.now()}` } });
  const tenantId = tenant.id;
  const at = (value: string) => parseIST(value)!;
  const day = at("2026-10-20 00:00:00"), previousDay = at("2026-10-19 00:00:00"), nextDay = at("2026-10-21 00:00:00");
  let checks = 0;
  const check = (name: string) => { checks++; console.log(`PASS ${name}`); };
  try {
    const branch = await prisma.branch.create({ data: { tenantId, code: "AUTO", name: "Automatic fixture" } });
    const morning = await prisma.shift.create({ data: { tenantId, name: "Morning", startTime: "08:00", endTime: "18:00" } });
    const evening = await prisma.shift.create({ data: { tenantId, name: "Evening", startTime: "20:00", endTime: "06:00", isNightShift: true } });
    const config = await prisma.configurationRecord.create({ data: { tenantId, scopeKey: `branch:${branch.id}`, kind: "branch_automatic_shifts", active: true, effectiveFrom: previousDay, createdBy: "isolated-test", payload: { enabled: true, shiftIds: [morning.id, evening.id], earlyMinutes: 60, lateMinutes: 240, outMinutes: 120 } } });
    const makeEmployee = (code: string, branchId: string | null = branch.id) => prisma.employee.create({ data: { tenantId, employeeNumber: code, firstName: "Boundary", lastName: "Fixture", branchId } });
    const add = (employeeId: string, time: string, inOutHint = "unknown") => prisma.punch.create({ data: { tenantId, employeeId, punchTime: at(time), inOutHint, source: "device", authStatus: "auto" } });
    const get = (employeeId: string, date = day) => prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
    const ids = (row: Awaited<ReturnType<typeof get>>) => (row?.punches as Array<{ id: string }> | null ?? []).map(p => p.id);

    const unmatched = await makeEmployee("QA/UNMATCHED");
    const nightIn = await add(unmatched.id, "2026-10-19 19:45:00");
    const nightOut = await add(unmatched.id, "2026-10-20 06:00:00");
    const earlyEvening = await add(unmatched.id, "2026-10-20 18:30:00");
    const prior = await prisma.attendance.create({ data: { tenantId, employeeId: unmatched.id, branchId: branch.id, date: previousDay, shiftId: evening.id, punchInTime: nightIn.punchTime, punchOutTime: nightOut.punchTime, status: "present", finalized: true, punches: [nightIn, nightOut].map((p, i) => ({ id: p.id, time: p.punchTime.toISOString(), type: i ? "out" : "in", source: "device" })) } });
    assert.equal((await attendanceDayForPunch(unmatched, nightOut.punchTime)).getTime(), previousDay.getTime());
    await reconcileEmployeeDay(tenant, unmatched, day);
    const current = await get(unmatched.id);
    assert.deepEqual(ids(current), [earlyEvening.id], "An unmatched shift must not copy yesterday's night OUT into today's fallback");
    assert.equal(current?.shiftId, null, "Do not broaden configured shift matching windows");
    assert.ok(current && assessmentRequiresReview(current), "Unmatched work stays under review");
    assert.deepEqual(await get(unmatched.id, previousDay), prior, "Finalized prior night remains unchanged");
    await reconcileEmployeeDay(tenant, unmatched, day);
    assert.deepEqual(ids(await get(unmatched.id)), [earlyEvening.id], "Retries retain one owner per source punch");
    assert.equal(await prisma.punch.count({ where: { employeeId: unmatched.id } }), 3);
    check("unmatched automatic fallback preserves prior night ownership and review state across retries");

    const overnightOnly = await makeEmployee("QA/OVERNIGHT-ONLY");
    const start = await add(overnightOnly.id, "2026-10-20 19:30:00");
    const end = await add(overnightOnly.id, "2026-10-21 06:00:00");
    await reconcileEmployeeDay(tenant, overnightOnly, day);
    assert.deepEqual(ids(await get(overnightOnly.id)), [start.id, end.id]);
    await reconcileEmployeeDay(tenant, overnightOnly, nextDay);
    assert.equal(await get(overnightOnly.id, nextDay), null, "Yesterday's closing OUT cannot create a second day's attendance when no new shift matches");
    check("matched overnight pair is retained without creating false next-day attendance");

    const normal = await makeEmployee("QA/CALENDAR", null);
    const first = await add(normal.id, "2026-10-20 08:00:00"), last = await add(normal.id, "2026-10-20 18:00:00");
    await reconcileEmployeeDay(tenant, normal, day);
    assert.deepEqual(ids(await get(normal.id)), [first.id, last.id]);
    assert.equal((await get(normal.id))?.punchInTime?.getTime(), first.punchTime.getTime());
    assert.equal((await get(normal.id))?.punchOutTime?.getTime(), last.punchTime.getTime());
    check("ordinary non-automatic calendar-day attendance keeps its complete pair");

    const explicit = await makeEmployee("QA/EXPLICIT-IN");
    const priorIn = await add(explicit.id, "2026-10-19 20:00:00");
    const closing = await add(explicit.id, "2026-10-20 07:15:00");
    const newIn = await add(explicit.id, "2026-10-20 07:00:00", "in");
    const newOut = await add(explicit.id, "2026-10-20 18:00:00", "out");
    await prisma.attendance.create({ data: { tenantId, employeeId: explicit.id, branchId: branch.id, date: previousDay, shiftId: evening.id, punchInTime: priorIn.punchTime, punchOutTime: closing.punchTime, status: "present", finalized: true, punches: [priorIn, closing].map((p, i) => ({ id: p.id, time: p.punchTime.toISOString(), type: i ? "out" : "in", source: "device" })) } });
    await reconcileEmployeeDay(tenant, explicit, day);
    assert.deepEqual(ids(await get(explicit.id)), [newIn.id, newOut.id], "A directed new-day IN does not pull in a later unknown prior-night OUT");
    check("explicit new-day IN and a nearby prior-night closing scan retain separate ownership");

    const policyAfter = await prisma.configurationRecord.findUniqueOrThrow({ where: { id: config.id } });
    assert.deepEqual(policyAfter, config, "Attendance calculations must not silently change shift policy");
    check("saved automatic shift policy and timing windows are unchanged");
    console.log(JSON.stringify({ checks, status: "passed", database: "peoplenexa_working" }));
  } finally {
    await prisma.punch.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
