import { readFile, writeFile } from "node:fs/promises";
import { istDateKey } from "../lib/ist";
/** Actual route + Excel round-trip checks against the isolated restored database.
 * The lab bundler substitutes ONLY the session boundary; all report/database
 * code and workbook writers are the production implementations.
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { GET as deviceReport } from "../app/api/reports/device/route";
import { GET as punchDetails } from "../app/api/reports/punch-details/route";
import { GET as masterData } from "../app/api/reports/master-data/route";
import { GET as inactiveReport } from "../app/api/reports/inactive-employees/route";
import { GET as mobileReport } from "../app/api/reports/mobile-punches/route";
import { GET as attendance } from "../app/api/attendance/route";
import { employeeLocationScope } from "../lib/location-scope";
import { parseIST } from "../lib/ist";

type Handler = (request: NextRequest) => Promise<Response>;
const globals = globalThis as typeof globalThis & { attendanceTestSession: unknown };
const request = (params: string) => new NextRequest(`http://localhost/attendance-lab?${params}`);
async function json(handler: Handler, params: string): Promise<any> {
  const res = await handler(request(params));
  assert.equal(res.status, 200, await res.clone().text());
  return res.json();
}
async function workbook(handler: Handler, params: string) {
  const res = await handler(request(params));
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
  return wb;
}
async function main() {
  assert.equal(process.env.ATTENDANCE_LAB, "isolated");
  const db = await prisma.$queryRaw<Array<{ db: string; listen: string }>>`SELECT current_database() AS db, current_setting('listen_addresses') AS listen`;
  assert.deepEqual(db, [{ db: "peoplenexa_working", listen: "" }]);
  globalThis.fetch = async () => { throw new Error("Network forbidden in report tests"); };
  const RealDate = Date;
  const fixed = new RealDate("2026-10-25T16:00:00Z").getTime();
  globalThis.Date = new Proxy(RealDate, {
    construct(target, args) { return Reflect.construct(target, args.length ? args : [fixed]); },
    get(target, property) { return property === "now" ? () => fixed : Reflect.get(target, property); },
  });
  const tenantId = "cmsyjwrm1000001njpjholt94";
  const manager = await prisma.employee.findFirstOrThrow({ where: { tenantId, role: "location_manager", location: { code: "MNP" } }, select: { id: true, locationId: true } });
  globals.attendanceTestSession = { sub: manager.id, tenantId, role: "location_manager" };
  const reports: Record<string, any> = {};
  const month = "month=2026-10";
  for (const kind of ["monthly", "status-matrix", "work-summary", "performance"]) {
    reports[kind] = await json(deviceReport, `kind=${kind}&${month}`);
    assert.equal(reports[kind].metadata.asOfDay, "2026-10-25");
  }
  const blocks = reports.monthly.blocks;
  const map = (kind: string) => new Map<string, any>(reports[kind].blocks.map((b: any) => [b.code, b]));
  const matrix = map("status-matrix"), work = map("work-summary"), performance = map("performance");
  let assessedCells = 0, dailyCells = 0, futureCells = 0;
  for (const b of blocks) {
    const m = matrix.get(b.code), w = work.get(b.code), p = performance.get(b.code);
    assert.ok(m && w && p);
    for (let i = 0; i < 31; i++) {
      const day = b.days[i];
      assert.equal(m.days[i].status, day.status, `${b.code}/${day.dayKey}: matrix status`);
      assert.equal(p.days[i].status, day.status, `${b.code}/${day.dayKey}: performance status`);
      assert.equal(w.rows[i].status, day.status, `${b.code}/${day.dayKey}: work status`);
      assert.equal(m.days[i].inTime, day.inTime);
      assert.equal(p.days[i].inTime, day.inTime);
      assert.equal(w.rows[i].firstIn, day.inTime);
      assert.equal(m.days[i].outTime, day.outTime);
      assert.equal(p.days[i].outTime, day.outTime);
      assert.equal(w.rows[i].lastOut, day.outTime);
      if (day.day > 25) { assert.equal(day.status, "Upcoming"); futureCells++; }
      if (day.status === "Review") assert.equal(w.rows[i].work, "Review");
      assessedCells++;
    }
    assert.equal(b.summary.absent, b.days.filter((d: any) => d.status === "A").length);
    assert.equal(p.totals.absent, b.summary.absent);
  }
  const byCode = new Map<string, any>(blocks.map((b: any) => [b.code, b]));
  assert.equal(byCode.get("MN/953").days[1].status, "Pending", "Retained October 2 source events without normalized punches are not an absence");
  for (let day = 1; day <= 25; day++) {
    const key = `2026-10-${String(day).padStart(2, "0")}`;
    const daily = await json(deviceReport, `kind=daily&date=${key}`);
    const adminRows = await json(attendance, `date=${key}`);
    const dailyByCode = new Map<string, any>(daily.rows.map((r: any) => [r.code, r]));
    for (const row of daily.rows) {
      const monthly = byCode.get(row.code)?.days[day - 1];
      assert.ok(monthly, `${row.code} in monthly population`);
      assert.equal(row.attendanceStatus, monthly.status, `${row.code}/${key}: daily assessed attendance`);
      assert.equal(row.inTime, monthly.inTime);
      assert.equal(row.outTime, monthly.outTime);
      dailyCells++;
    }
    const codes: Record<string, string> = { present: "P", late: "P", permission: "P", half_day: "½P", absent: "A", pending: "Pending", needs_review: "Review", upcoming: "Upcoming", not_employed: "—", on_leave: "L", holiday: "H", weekly_off: "WO" };
    for (const r of adminRows.rows) assert.equal(codes[r.status], dailyByCode.get(r.employee.employeeNumber)?.attendanceStatus, `${r.employee.employeeNumber}/${key}: attendance API`);
  }
  const assessmentResult = { check: "all report assessments and clocks", employees: blocks.length, assessedCells, dailyCells, futureCells, status: "passed" };
  console.log(JSON.stringify(assessmentResult));
  await writeFile("/tmp/report-verification.json", JSON.stringify(assessmentResult, null, 2));

  // Round-trip the actual Excel writers and compare each data row to JSON.
  for (const kind of ["monthly", "status-matrix", "work-summary", "performance"]) {
    const wb = await workbook(deviceReport, `kind=${kind}&${month}&q=MN%2F004&format=xlsx`);
    assert.ok(wb.getWorksheet("Report Notes"));
    const expected = (await json(deviceReport, `kind=${kind}&${month}&q=MN%2F004`)).blocks[0];
    const sheet = wb.worksheets[0];
    if (kind === "monthly") {
      const header = sheet.getRows(1, sheet.rowCount)!.find(r => r.getCell(1).text === "Day");
      assert.ok(header);
      for (let i = 0; i < 31; i++) {
        const row = sheet.getRow(header.number + i + 1), d = expected.days[i];
        assert.equal(row.getCell(2).text, d.status);
        assert.equal(row.getCell(4).text, d.inTime);
        assert.equal(row.getCell(5).text, d.outTime);
        assert.equal(row.getCell(8).text, d.duration);
      }
    } else if (kind === "work-summary") {
      const header = sheet.getRows(1, sheet.rowCount)!.find(r => r.getCell(1).text === "Date");
      assert.ok(header);
      for (let i = 0; i < 31; i++) {
        const row = sheet.getRow(header.number + i + 1), d = expected.rows[i];
        assert.equal(row.getCell(2).text, d.status);
        assert.equal(row.getCell(4).text, d.firstIn);
        assert.equal(row.getCell(5).text, d.lastOut);
        assert.equal(row.getCell(7).text, d.work);
      }
      assert.equal(sheet.getRow(header.number + 32).getCell(6).text, expected.totals.gross);
    } else {
      const marker = kind === "status-matrix" ? "ATT" : "Status";
      const offset = kind === "status-matrix" ? 5 : 1;
      const row = sheet.getRows(1, sheet.rowCount)!.find(r => r.getCell(kind === "status-matrix" ? 5 : 1).text === marker);
      assert.ok(row, `${kind}: status row`);
      expected.days.forEach((d: any, i: number) => assert.equal(row.getCell(i + offset + 1).text, d.status));
    }
    console.log(`PASS ${kind} Excel values match JSON`);
  }
  const daily = await json(deviceReport, "kind=daily&date=2026-10-02&q=MN%2F004");
  const dailyWb = await workbook(deviceReport, "kind=daily&date=2026-10-02&q=MN%2F004&format=xlsx");
  assert.equal(dailyWb.worksheets[0].getRow(3).getCell(13).text, daily.rows[0].attendanceStatus);
  const pd = await json(punchDetails, "from=2026-10-01&to=2026-10-25&q=MN%2F004&size=500");
  assert.ok(pd.rows.length);
  for (const r of pd.rows) {
    const key = new RealDate(r.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const index = Number(key.slice(-2)) - 1;
    assert.equal(r.assessment, byCode.get(r.employee.employeeNumber).days[index].status);
    if (r.requiresReview) assert.equal(r.workingMinutes, null);
  }
  const pdWb = await workbook(punchDetails, "from=2026-10-01&to=2026-10-25&q=MN%2F004&format=xlsx");
  assert.equal(pdWb.worksheets[0].rowCount - 1, pd.total);
  assert.ok(pdWb.worksheets[0].getRow(2).getCell(11).text.includes("/2026"), "Punch export includes full date");

  const scope = { tenantId, loginOnly: false, ...employeeLocationScope(manager.locationId!) };
  const master = await workbook(masterData, "");
  assert.equal(master.getWorksheet("Employees")!.rowCount - 1, await prisma.employee.count({ where: scope }));
  const expectedLocation = await prisma.location.findUniqueOrThrow({ where: { id: manager.locationId! }, select: { name: true } });
  const branchless = await prisma.employee.findMany({ where: { ...scope, branchId: null }, select: { employeeNumber: true } });
  const branchlessCodes = new Set(branchless.map(e => e.employeeNumber));
  master.getWorksheet("Employees")!.eachRow((r, i) => { if (i > 1 && branchlessCodes.has(r.getCell(1).text)) assert.equal(r.getCell(10).text, expectedLocation.name); });
  const inactive = await workbook(inactiveReport, "");
  const inactiveFull = await workbook(masterData, "status=inactive");
  assert.equal(inactive.worksheets[0].rowCount, inactiveFull.getWorksheet("Employees")!.rowCount);
  const mobile = await json(mobileReport, "from=2026-10-01&to=2026-10-25");
  const mobileWb = await workbook(mobileReport, "from=2026-10-01&to=2026-10-25&format=xlsx");
  assert.equal(mobileWb.worksheets[0].rowCount - 1, mobile.rows.length);
  console.log(JSON.stringify({ check: "other exports", punchDetails: pd.total, master: master.getWorksheet("Employees")!.rowCount - 1, inactive: inactive.worksheets[0].rowCount - 1, mobile: mobile.rows.length, status: "passed" }));

  if (process.env.ATTENDANCE_SOURCE_JSON) {
    const source: Array<{ row: number; device: string; code: string; time: string }> = JSON.parse(await readFile(process.env.ATTENDANCE_SOURCE_JSON, "utf8"));
    const registry = await prisma.employee.findMany({ where: { tenantId, loginOnly: false }, select: { id: true, deviceCode: true, employeeNumber: true } });
    const codes = new Map(registry.map(e => [e.id, e.deviceCode ?? e.employeeNumber]));
    const normalized = await prisma.punch.findMany({ where: { tenantId, punchTime: { gte: parseIST("2026-10-01 00:00:00")!, lt: parseIST("2026-10-26 00:00:00")! } }, select: { employeeId: true, punchTime: true, authStatus: true } });
    const retained = await prisma.deviceLog.findMany({ where: { tenantId, punchTime: { gte: parseIST("2026-10-01 00:00:00")!, lt: parseIST("2026-10-26 00:00:00")! } }, select: { userId: true, punchTime: true } });
    const normalizedKeys = new Set(normalized.filter(p => ["auto", "approved"].includes(p.authStatus)).map(p => `${codes.get(p.employeeId)}|${p.punchTime.getTime()}`));
    const rawKeys = new Set(retained.map(p => `${p.userId}|${p.punchTime?.getTime()}`));
    const missingNormalized = source.filter(r => !normalizedKeys.has(`${r.code}|${parseIST(r.time)!.getTime()}`));
    const missingRaw = source.filter(r => !rawKeys.has(`${r.code}|${parseIST(r.time)!.getTime()}`));
    const sourceResult = { rows: source.length, timestampAndExactCodeRetained: source.length - missingRaw.length, timestampAndExactCodeAuthorized: source.length - missingNormalized.length, missingNormalized, missingRaw, limitation: "Timestamp and exact employee code coverage, not serial-number identity. The source has device names and no serial numbers; cross-device identity remains a separate topology check." };
    await writeFile("/tmp/source-file-comparison.json", JSON.stringify(sourceResult, null, 2));
    console.log(JSON.stringify({ check: "source file timestamp/code coverage", rows: source.length, retained: source.length - missingRaw.length, authorized: source.length - missingNormalized.length, missingRaw: missingRaw.length, missingNormalized: missingNormalized.length }));
  }

  // Foreign branch parameters must fail rather than expand a manager's scope.
  const foreign = await prisma.branch.findFirstOrThrow({ where: { tenantId, locationId: { not: manager.locationId } } });
  assert.equal((await deviceReport(request(`kind=monthly&${month}&branchId=${foreign.id}`))).status, 403);
  globals.attendanceTestSession = { sub: "missing-scope", tenantId, role: "location_manager" };
  assert.equal((await deviceReport(request(`kind=monthly&${month}`))).status, 403);
  globals.attendanceTestSession = { sub: manager.id, tenantId, role: "employee" };
  assert.equal((await deviceReport(request(`kind=monthly&${month}`))).status, 401);
  console.log("PASS report scope rejects foreign branch, missing assignment, and employee role");
  const qa = await prisma.tenant.create({ data: { name: "Mobile report QA", code: `REPORT-${RealDate.now()}`, slug: `report-${RealDate.now()}` } });
  try {
    const loc = await prisma.location.create({ data: { tenantId: qa.id, name: "QA location", code: "QA" } });
    const inside = await prisma.employee.create({ data: { tenantId: qa.id, employeeNumber: "QA-IN", deviceCode: "0004", firstName: "QA", lastName: "Inside", locationId: loc.id } });
    const outside = await prisma.employee.create({ data: { tenantId: qa.id, employeeNumber: "QA-OUT", firstName: "QA", lastName: "Outside" } });
    const fixture = (employeeId: string, authStatus: string, hour: number) => ({ tenantId: qa.id, employeeId, source: "mobile", punchTime: parseIST(`2026-10-20 ${hour}:00:00`)!, inOutHint: "in", authStatus, lat: 17.48, lng: 78.55, locationAccuracy: 12, locationStatus: "inside", faceStatus: "verified", holdReason: authStatus === "pending" ? "review" : null });
    await prisma.punch.createMany({ data: [fixture(inside.id, "pending", 10), fixture(inside.id, "approved", 11), fixture(inside.id, "declined", 12), fixture(outside.id, "approved", 13)] });
    globals.attendanceTestSession = { sub: inside.id, tenantId: qa.id, role: "location_manager" };
    const inRows = await json(mobileReport, "from=2026-10-20&to=2026-10-20");
    assert.equal(inRows.rows.length, 3, "Evidence report retains every authorization state");
    const hidden = await json(mobileReport, "from=2026-10-20&to=2026-10-20&q=QA-OUT");
    assert.equal(hidden.total, 0, "A search OR cannot override location restrictions");
    const book = await workbook(mobileReport, "from=2026-10-20&to=2026-10-20&format=xlsx");
    assert.equal(book.worksheets[0].rowCount, 4);
    for (let i = 0; i < 3; i++) {
      assert.equal(book.worksheets[0].getRow(i + 2).getCell(6).value, inRows.rows[i].lat);
      assert.equal(book.worksheets[0].getRow(i + 2).getCell(8).value, inRows.rows[i].locationAccuracy);
      assert.equal(book.worksheets[0].getRow(i + 2).getCell(14).value, inRows.rows[i].authStatus);
    }
    console.log("PASS mobile export preserves GPS, authorization and exact IDs; searched foreign employee remains hidden");
  } finally {
    await prisma.punch.deleteMany({ where: { tenantId: qa.id } });
    await prisma.location.deleteMany({ where: { tenantId: qa.id } });
    await prisma.tenant.delete({ where: { id: qa.id } });
  }
  await prisma.$disconnect();
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
