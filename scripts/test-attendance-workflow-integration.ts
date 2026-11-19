import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { signToken, SESSION_COOKIE } from "../lib/auth";
import { attendanceDayKey } from "../lib/reconcile";
import { parseIST } from "../lib/ist";
import { handleDevicePunch, reprocessFailedLogs } from "../lib/iclock";
import { handleRealtimePunch, reprocessFailedRealtimeLogs } from "../lib/realtime-devices";
import { PATCH as reviewCorrection } from "../app/api/attendance/corrections/[id]/route";
import { POST as addPunch, DELETE as removePunch } from "../app/api/attendance/[id]/punches/route";
import { POST as applyLeave } from "../app/api/leaves/requests/route";
import { GET as previewLeave } from "../app/api/leaves/preview/route";
import { POST as reviewFacePunch } from "../app/api/face/review/route";
import { GET as deviceReport } from "../app/api/reports/device/route";
import { GET as mobilePunches } from "../app/api/reports/mobile-punches/route";
import { POST as assignRoster } from "../app/api/rosters/route";
import type { Prisma } from "../generated/prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unconfigured");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && /_(test|stage)$/.test(url.pathname),
  "Use a disposable loopback PostgreSQL database ending in _test or _stage.",
);

const request = (path: string, method: string, data?: object) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    ...(data && { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }),
  });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const time = (value: string) => parseIST(value)!;

async function main() {
  const marker = randomUUID();
  const tenant = await prisma.tenant.create({ data: { code: marker, slug: marker, name: "Attendance integration fixture" } });
  const tenantId = tenant.id;
  const headers = createRequire(import.meta.url)("next/headers");
  const originalCookies = headers.cookies;
  const transaction = prisma.$transaction;
  let failAttendance = false;
  let token = "";
  headers.cookies = async () => ({ get: (name: string) => name === SESSION_COOKIE ? { value: token } : undefined });
  function failReconciliation() {
    throw new Error("Injected attendance write failure");
  }
  try {
    prisma.$transaction = ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Parameters<typeof transaction>[1]) => {
      if (!failAttendance || typeof callback !== "function") return transaction.call(prisma, callback, options);
      return transaction.call(prisma, (tx: Prisma.TransactionClient) => {
        const proxy = new Proxy(tx, {
          get(target, key, receiver) {
            if (key !== "attendance") return Reflect.get(target, key, receiver);
            return new Proxy(target.attendance, {
              get(delegate, operation, delegateReceiver) {
                if (operation === "create" || operation === "update" || operation === "delete") return failReconciliation;
                return Reflect.get(delegate, operation, delegateReceiver);
              },
            });
          },
        });
        return callback(proxy);
      }, options);
    }) as typeof prisma.$transaction;
    const employee = (employeeNumber: string, fields: Partial<Prisma.EmployeeUncheckedCreateInput> = {}) =>
      prisma.employee.create({ data: { tenantId, employeeNumber, firstName: "Test", lastName: employeeNumber, ...fields } });
    const admin = await employee("ADM", { role: "admin" });
    const deviceEmployee = await employee("DEVICE", { deviceCode: "001" });
    const nightShift = await prisma.shift.create({ data: { tenantId, name: "Night", startTime: "22:00", endTime: "06:00", isNightShift: true } });
    const dayShift = await prisma.shift.create({ data: { tenantId, name: "Day", startTime: "09:00", endTime: "18:00" } });
    const worker = await employee("WORKER", { shiftId: nightShift.id });
    const direct = await prisma.device.create({ data: { tenantId, name: "Synthetic direct", serialNumber: marker } });
    const realtime = await prisma.realtimeDevice.create({ data: { tenantId, name: "Synthetic realtime", serialNumber: marker, apiKey: randomUUID() } });
    const directEvent = { userId: "001", punchTime: time("2026-03-03 08:00:00"), rawLine: "fixture", inOutMode: "5" };
    const realtimeEvent = { userId: "001", punchTime: time("2026-03-04 08:00:00"), rawLine: "fixture", inOutMode: "5" };

    failAttendance = true;
    await assert.rejects(handleDevicePunch(direct, directEvent), /Injected attendance write failure/);
    await assert.rejects(handleRealtimePunch(realtime, realtimeEvent), /Injected attendance write failure/);
    assert.equal(await prisma.punch.count({ where: { tenantId, employeeId: deviceEmployee.id } }), 2);
    assert.equal(await prisma.attendance.count({ where: { tenantId } }), 0);
    const directLog = await prisma.deviceLog.findFirstOrThrow({ where: { tenantId } });
    const realtimeLog = await prisma.realtimeLog.findFirstOrThrow({ where: { tenantId } });
    assert.equal(directLog.processed, false);
    assert.equal(realtimeLog.processed, false);
    assert.match(directLog.error ?? "", /can be retried/);
    // Reprocessing a previously normalized punch retains the original employee.
    await prisma.employee.update({ where: { id: deviceEmployee.id }, data: { deviceCode: null, status: "inactive" } });
    const replacement = await employee("REPLACEMENT", { deviceCode: "001" });
    failAttendance = false;
    assert.equal((await handleDevicePunch(direct, directEvent)).action, "duplicate");
    assert.deepEqual(await reprocessFailedRealtimeLogs(tenantId), { accepted: 0, duplicate: 1, failed: 0 });
    assert.deepEqual(await reprocessFailedLogs(tenantId), { accepted: 0, duplicate: 0, failed: 0 });
    assert.equal(await prisma.attendance.count({ where: { tenantId, employeeId: deviceEmployee.id, punchInTime: { not: null } } }), 2);
    assert.equal(await prisma.attendance.count({ where: { tenantId, employeeId: replacement.id } }), 0);
    assert.equal(await prisma.punch.count({ where: { tenantId, employeeId: deviceEmployee.id } }), 2);
    assert.equal((await prisma.realtimeLog.findUniqueOrThrow({ where: { id: realtimeLog.id } })).error, null);
    failAttendance = true;
    assert.equal((await handleRealtimePunch(realtime, realtimeEvent)).action, "duplicate", "clean replay must skip reconciliation");
    failAttendance = false;

    token = signToken({ tenantId, sub: admin.id, role: "admin" });
    const night = time("2026-03-05 00:00:00");
    const nextNight = time("2026-03-06 00:00:00");
    const inAt = time("2026-03-05 22:00:00");
    const beforeOut = time("2026-03-06 05:00:00");
    const afterOut = time("2026-03-06 06:00:00");
    const prior = await prisma.attendance.create({ data: { tenantId, employeeId: worker.id, date: night, status: "present", finalized: true, punchInTime: inAt, punchOutTime: beforeOut, shiftId: nightShift.id } });
    const next = await prisma.attendance.create({ data: { tenantId, employeeId: worker.id, date: nextNight, status: "present", finalized: true, shiftId: nightShift.id } });
    await prisma.punch.createMany({ data: [
      { tenantId, employeeId: worker.id, punchTime: inAt, source: "device", inOutHint: "in" },
      { tenantId, employeeId: worker.id, punchTime: beforeOut, source: "device", inOutHint: "out" },
      { tenantId, employeeId: worker.id, punchTime: time("2026-03-06 06:30:00"), source: "mobile", inOutHint: "out", authStatus: "pending", faceStatus: "rejected" },
    ] });
    const correction = await prisma.punchCorrection.create({ data: { tenantId, employeeId: worker.id, date: night, requestedOut: afterOut, reason: "Missed time" } });
    const approve = () => reviewCorrection(request("/correction", "PATCH", { status: "approved" }), context(correction.id));
    const supervisor = await employee("SUP", { role: "supervisor" });
    token = signToken({ tenantId, sub: supervisor.id, role: "supervisor" });
    assert.equal((await approve()).status, 403, "overnight face rejection requires an admin on the real shift window");
    token = signToken({ tenantId, sub: admin.id, role: "admin" });
    failAttendance = true;
    await assert.rejects(approve(), /Injected attendance write failure/);
    assert.equal((await prisma.punchCorrection.findUniqueOrThrow({ where: { id: correction.id } })).status, "pending");
    assert.deepEqual((await prisma.attendance.findUniqueOrThrow({ where: { id: prior.id } })).punchOutTime, beforeOut);
    assert.equal(await prisma.punch.count({ where: { tenantId, employeeId: worker.id, punchTime: afterOut } }), 0);
    failAttendance = false;
    assert.equal((await approve()).status, 200);
    assert.deepEqual((await prisma.attendance.findUniqueOrThrow({ where: { id: prior.id } })).punchOutTime, afterOut);
    assert.equal((await prisma.attendance.findUniqueOrThrow({ where: { id: next.id } })).finalized, true, "overnight review does not reopen the next canonical date");
    assert.equal(await prisma.punch.count({ where: { tenantId, employeeId: worker.id, authStatus: "pending", punchTime: time("2026-03-06 06:30:00") } }), 1);

    const add = () => addPunch(request("/punches", "POST", { time: "2026-03-06T03:00" }), context(prior.id));
    failAttendance = true;
    await assert.rejects(add(), /Injected attendance write failure/);
    assert.equal(await prisma.punch.count({ where: { tenantId, employeeId: worker.id, source: "admin" } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, action: "punch.add" } }), 0);
    failAttendance = false;
    assert.equal((await add()).status, 200);
    const added = await prisma.punch.findFirstOrThrow({ where: { tenantId, employeeId: worker.id, source: "admin" } });
    const remove = () => removePunch(request(`/punches?punchId=${added.id}`, "DELETE"), context(prior.id));
    failAttendance = true;
    await assert.rejects(remove(), /Injected attendance write failure/);
    assert.ok(await prisma.punch.findUnique({ where: { id: added.id } }));
    failAttendance = false;
    assert.equal((await remove()).status, 200);
    assert.equal(await prisma.punch.findUnique({ where: { id: added.id } }), null);

    const invalidCorrection = await prisma.punchCorrection.create({ data: {
      tenantId, employeeId: worker.id, date: night, requestedIn: time("2026-03-06 07:00:00"), reason: "Inverted historical correction",
    } });
    const invalidReview = await reviewCorrection(request("/correction", "PATCH", { status: "approved" }), context(invalidCorrection.id));
    assert.equal(invalidReview.status, 400);
    assert.match((await invalidReview.json()).error, /Clock-in must be before clock-out/);
    assert.equal((await prisma.punchCorrection.findUniqueOrThrow({ where: { id: invalidCorrection.id } })).status, "pending");
    assert.deepEqual((await prisma.attendance.findUniqueOrThrow({ where: { id: prior.id } })).punchInTime, inAt);

    const held = await prisma.punch.findFirstOrThrow({ where: { tenantId, employeeId: worker.id, authStatus: "pending" } });
    const reviewHeld = () => reviewFacePunch(request("/face-review", "POST", { punchId: held.id, decision: "accept" }));
    failAttendance = true;
    await assert.rejects(reviewHeld(), /Injected attendance write failure/);
    assert.equal((await prisma.punch.findUniqueOrThrow({ where: { id: held.id } })).authStatus, "pending");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, action: "punch.authorization" } }), 0);
    failAttendance = false;
    assert.equal((await reviewHeld()).status, 200);
    assert.equal((await prisma.punch.findUniqueOrThrow({ where: { id: held.id } })).authStatus, "approved");
    assert.deepEqual((await prisma.attendance.findUniqueOrThrow({ where: { id: prior.id } })).punchOutTime, held.punchTime);
    assert.equal((await reviewHeld()).status, 409);

    const type = await prisma.leaveType.create({ data: { tenantId, code: "TEST", name: "Test Leave", maxDays: 20, requiresApproval: false } });
    const leaveDate = "2026-04-07";
    token = signToken({ tenantId, sub: worker.id, role: "employee" });
    const leaveInput = { leaveTypeId: type.id, fromDate: leaveDate, toDate: leaveDate };
    const preview = await previewLeave(request(`/leave?from=${leaveDate}&to=${leaveDate}&type=${type.id}`, "GET"));
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).days, 1);
    const submitted = await applyLeave(request("/leave", "POST", leaveInput));
    const payload = await submitted.json();
    assert.equal(submitted.status, 201, JSON.stringify(payload));
    const leave = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: payload.request.id } });
    assert.equal(leave.fromDate.toISOString(), `${leaveDate}T00:00:00.000Z`);
    const overlap = await applyLeave(request("/leave", "POST", leaveInput));
    assert.equal(overlap.status, 400);
    assert.match((await overlap.json()).error, /overlaps/);
    await prisma.leaveRequest.update({ where: { id: leave.id }, data: { leavePolicySnapshot: { calendar: { chargeableDays: { [leaveDate]: 0 } } } } });
    await prisma.holiday.create({ data: { tenantId, name: "Prior-year recurring holiday", date: time("2025-04-07 00:00:00"), isRecurring: true } });

    token = signToken({ tenantId, sub: admin.id, role: "admin" });
    const roster = (shiftId: string, overwrite: boolean) => assignRoster(request("/roster", "POST", {
      shiftId, overwrite, employeeIds: [worker.id, worker.id], dateFrom: leaveDate, dateTo: leaveDate,
    }));
    const [firstResponse, secondResponse] = await Promise.all([roster(nightShift.id, false), roster(dayShift.id, false)]);
    const clashes = await Promise.all([firstResponse, secondResponse].map(async response => ({ status: response.status, ...(await response.json()) })));
    const winner = clashes.find(result => result.created === 1);
    assert.ok(winner, JSON.stringify(clashes));
    assert.equal(clashes.filter(result => result.created === 1).length, 1);
    assert.equal(winner.holidayConflicts, 1);
    assert.equal(winner.leaveConflicts, 0);
    const assigned = await prisma.rosterAssignment.findFirstOrThrow({ where: { tenantId, date: attendanceDayKey(new Date(`${leaveDate}T00:00:00Z`)) } });
    const oppositeShift = assigned.shiftId === nightShift.id ? dayShift.id : nightShift.id;
    const skipped = await roster(oppositeShift, false);
    assert.equal(skipped.status, 200);
    assert.equal((await skipped.json()).clashes, 1);
    assert.equal((await prisma.rosterAssignment.findUniqueOrThrow({ where: { id: assigned.id } })).shiftId, assigned.shiftId);
    assert.equal((await roster(oppositeShift, true)).status, 200);
    assert.equal((await prisma.rosterAssignment.findUniqueOrThrow({ where: { id: assigned.id } })).shiftId, oppositeShift);
    const [ownLocation, otherLocation] = await Promise.all([
      prisma.location.create({ data: { tenantId, name: "Own location", code: "OWN" } }),
      prisma.location.create({ data: { tenantId, name: "Other location", code: "OTHER" } }),
    ]);
    await prisma.employee.update({ where: { id: worker.id }, data: { locationId: ownLocation.id } });
    const locationManager = await employee("LOCATION_MANAGER", { role: "location_manager", locationId: ownLocation.id });
    const other = await employee("OTHER_LOCATION", { locationId: otherLocation.id });
    const evidenceTime = time("2026-04-08 09:00:00");
    await prisma.punch.createMany({ data: [worker, other].map(({ id }) => ({
      tenantId, employeeId: id, source: "mobile", punchTime: evidenceTime,
    })) });
    token = signToken({ tenantId, sub: locationManager.id, role: locationManager.role });
    const otherSearch = await mobilePunches(request("/mobile-punches?from=2026-04-08&q=OTHER_LOCATION", "GET"));
    assert.equal(otherSearch.status, 200);
    assert.equal((await otherSearch.json()).total, 0, "search terms cannot replace a location manager's assignment scope");
    const ownSearch = await mobilePunches(request("/mobile-punches?from=2026-04-08&q=Test%20WORKER", "GET"));
    assert.equal((await ownSearch.json()).total, 1, "search can match both names of an in-scope employee");

    await prisma.tenant.update({ where: { id: tenantId }, data: { config: {
      workspaceRegion: { countryCode: "US", currency: "USD", locale: "en-US", timeZone: "America/New_York" },
    } } });
    const [regionalBranch, foreignBranch] = await Promise.all([
      prisma.branch.create({ data: { tenantId, locationId: ownLocation.id, name: "Regional home branch", code: "REGION-HOME" } }),
      prisma.branch.create({ data: { tenantId, locationId: otherLocation.id, name: "Regional foreign branch", code: "REGION-AWAY" } }),
    ]);
    const regional = await employee("REGIONAL", { branchId: regionalBranch.id });
    const foreign = await employee("FOREIGN_WORKER", { branchId: foreignBranch.id });
    const branchManager = await employee("REGIONAL_MANAGER", { role: "branch_manager", branchId: regionalBranch.id, loginOnly: true });
    const pendingOnly = await employee("PENDING_ONLY");
    const localNight = await prisma.shift.create({ data: { tenantId, name: "Regional night", startTime: "22:00", endTime: "05:00", isNightShift: true } });
    await prisma.attendance.create({ data: {
      tenantId, employeeId: regional.id, date: time("2026-03-07 00:00:00"), status: "present", shiftId: localNight.id,
      punchInTime: new Date("2026-03-08T03:00:00Z"), punchOutTime: new Date("2026-03-08T06:30:00Z"),
    } });
    await prisma.punch.createMany({ data: [
      { tenantId, employeeId: regional.id, source: "device", punchTime: new Date("2026-04-01T03:30:00Z"), inOutHint: "out" },
      { tenantId, employeeId: regional.id, source: "device", punchTime: new Date("2026-04-01T04:00:00Z"), inOutHint: "in" },
      { tenantId, employeeId: pendingOnly.id, source: "mobile", punchTime: new Date("2026-04-01T03:40:00Z"), inOutHint: "in", authStatus: "pending" },
      { tenantId, employeeId: foreign.id, source: "device", punchTime: new Date("2026-04-01T03:30:00Z"), inOutHint: "out" },
    ] });
    token = signToken({ tenantId, sub: admin.id, role: admin.role });
    const monthResponse = await deviceReport(request("/device-report?kind=monthly&month=2026-03&q=REGIONAL&page=0", "GET"));
    const monthOutput = await monthResponse.json();
    assert.equal(monthResponse.status, 200);
    assert.equal(monthOutput.timeZone, "America/New_York");
    const overnight = monthOutput.blocks[0].days[6];
    assert.deepEqual([overnight.dayKey, overnight.inTime, overnight.outTime, overnight.earlyBy, overnight.duration],
      ["2026-03-07", "22:00", "01:30", "2:30", "3:30"]);
    const morningResponse = await deviceReport(request("/device-report?kind=daily&date=2026-03-31&q=REGIONAL", "GET"));
    const morning = (await morningResponse.json()).rows[0];
    assert.deepEqual([morning.status, morning.inTime, morning.outTime, morning.punches], ["P", "", "23:30", "23:30OUT;"]);
    const pendingResponse = await deviceReport(request("/device-report?kind=daily&date=2026-03-31&q=PENDING_ONLY", "GET"));
    assert.equal((await pendingResponse.json()).rows[0].status, "A");
    async function exportedCells(path: string) {
      const response = await deviceReport(request(path + "&format=xlsx", "GET"));
      assert.equal(response.status, 200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const cells: string[] = [];
      for (const sheet of workbook.worksheets) sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.text)));
      return cells;
    }
    const cells = await exportedCells("/device-report?kind=monthly&month=2026-03&q=REGIONAL");
    for (const value of ["22:00", "01:30", "2:30", "3:30"]) assert.ok(cells.includes(value), "the workbook retains the same regional times as the screen");
    assert.ok(cells.some((cell) => cell.includes("America/New_York")));
    for (const reviewer of [locationManager, branchManager]) {
      token = signToken({ tenantId, sub: reviewer.id, role: reviewer.role });
      for (const period of ["kind=daily&date=2026-03-31", "kind=monthly&month=2026-03"]) {
        const scopedCells = await exportedCells(`/device-report?${period}`);
        assert.ok(scopedCells.some((cell) => cell.includes("REGIONAL")));
        assert.ok(!scopedCells.some((cell) => cell.includes("FOREIGN_WORKER")), "export must exclude employees outside the reviewer's assignment");
        const denied = await deviceReport(request(`/device-report?${period}&branchId=${foreignBranch.id}&format=xlsx`, "GET"));
        assert.equal(denied.status, 403);
      }
    }

    console.log("Device replay, overnight attendance transactions, timezone-independent leave, concurrent rosters, scoped mobile reports, and regional daily/monthly JSON and workbook reports passed.");
  } finally {
    headers.cookies = originalCookies;
    prisma.$transaction = transaction;
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
