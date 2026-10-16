import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { signToken, SESSION_COOKIE } from "../lib/auth";
import { uniqueRosterLocations, discoverMachineEmployeeLocations, attachPendingMachineLocations } from "../lib/machine-employee-location";
import { masterStatusWhere } from "../lib/employee-master-list";
import { employeeLocationScope } from "../lib/location-scope";
import { importEmployeesFromEbioserver } from "../lib/ebioserver";
import { GET as getMaster } from "../app/api/employees/[id]/master/route";

async function main() {
  const rosters = [{ locationId: "A", codes: ["100", "shared", "YLR/158"] }, { locationId: "A", codes: ["100"] }, { locationId: "B", codes: ["200", "shared", "YLR0158"] }];
  const unique = uniqueRosterLocations(rosters);
  assert.equal(unique.get("100"), "A"); assert.equal(unique.get("200"), "B"); assert.equal(unique.has("shared"), false);
  assert.equal(unique.get("YLR/158"), "A"); assert.equal(unique.get("YLR0158"), "B", "never rewrite machine IDs");
  const require = createRequire(import.meta.url), headers = require("next/headers"), oldCookies = headers.cookies;
  const soap = require("soap"), oldSoapClient = soap.createClientAsync;
  const saved = { many: prisma.employee.findMany, create: prisma.employee.createMany, logs: prisma.deviceLog.findMany, devices: prisma.device.findMany, update: prisma.employee.updateMany, audit: prisma.auditLog.create, first: prisma.employee.findFirst, employee: prisma.employee.findUnique };
  const records = [
    { id: "pending", tenantId: "T", deviceCode: "100", employeeNumber: "HR100", branchId: null, locationId: null, status: "inactive", role: "employee", loginOnly: false, legacyImportData: { source: "ebioserver" }, email: null },
    { id: "active", tenantId: "T", deviceCode: "200", employeeNumber: "HR200", branchId: "branchB", locationId: "B", status: "active", role: "employee", loginOnly: false, legacyImportData: { source: "ebioserver" }, email: null },
    { id: "manual", tenantId: "T", deviceCode: "manual", employeeNumber: "MANUAL", branchId: null, locationId: null, status: "inactive", role: "employee", loginOnly: false, legacyImportData: null, email: null },
    { id: "foreign", tenantId: "OTHER", deviceCode: "100", employeeNumber: "100", branchId: null, locationId: null, status: "inactive", role: "employee", loginOnly: false, legacyImportData: { source: "ebioserver" }, email: null },
    { id: "wrong-device-code", tenantId: "T", deviceCode: "different", employeeNumber: "100", branchId: null, locationId: null, status: "inactive", role: "employee", loginOnly: false, legacyImportData: { source: "ebioserver" }, email: null },
  ];
  let updates = 0;
  prisma.device.findMany = (async (args: any) => {
    assert.equal(args.where.tenantId, "T"); assert.equal(args.where.branch.tenantId, "T"); assert.equal(args.where.branch.location.tenantId, "T");
    return [{ config: { locationCode: "GROUP_A" }, branch: { locationId: "A" } }, { config: { locationCode: "GROUP_A" }, branch: { locationId: "A" } }, { config: { locationCode: "GROUP_B" }, branch: { locationId: "B" } }];
  }) as any;
  prisma.employee.updateMany = (async (args: any) => {
    updates++;
    assert.deepEqual(Object.keys(args.data), ["locationId"], "import cannot activate, assign branches, reset passwords or change identifiers");
    assert.equal(args.where.locationId, null); assert.equal(args.where.branchId, null);
    const codes = args.where.AND[0].OR[0].deviceCode.in;
    const matches = records.filter(row => row.tenantId === args.where.tenantId && !row.branchId && !row.locationId && row.legacyImportData?.source === "ebioserver" && codes.includes(row.deviceCode));
    for (const row of matches) Object.assign(row, args.data);
    return { count: matches.length };
  }) as any;
  prisma.auditLog.create = (async (args: any) => args.data) as any;
  try {
    const calls: string[] = [];
    const discovered = await discoverMachineEmployeeLocations("T", async code => { calls.push(code); return code === "GROUP_A" ? ["100", "shared"] : ["200", "shared"]; });
    assert.deepEqual(calls.sort(), ["GROUP_A", "GROUP_B"], "one call per group, not per device or employee");
    assert.equal(discovered.locations.get("100"), "A"); assert.equal(discovered.locations.has("shared"), false);
    const unavailable = await discoverMachineEmployeeLocations("T", async code => { if (code === "GROUP_B") throw new Error("offline"); return ["100"]; });
    assert.equal(unavailable.incomplete, true); assert.equal(unavailable.locations.size, 0, "partial results cannot establish unique ownership");
    assert.equal(await attachPendingMachineLocations("T", discovered.locations), 1);
    assert.equal(records[0].locationId, "A"); assert.equal(records[0].status, "inactive"); assert.equal(records[0].branchId, null);
    assert.equal(records[1].locationId, "B"); assert.equal(records[2].locationId, null); assert.equal(records[3].locationId, null); assert.equal(records[4].locationId, null);
    assert.equal(await attachPendingMachineLocations("T", discovered.locations), 0, "repeat imports preserve existing ownership");
    assert.ok(updates <= 4, "ownership writes are batched by location");
    const scope = employeeLocationScope("A");
    const filtered = masterStatusWhere({ tenantId: "T", loginOnly: false, AND: [scope], OR: [{ firstName: { contains: "test" } }] }, "assignment_pending");
    assert.deepEqual((filtered.AND as any[])[0], scope, "pending filter must preserve manager scope");
    assert.deepEqual(filtered.OR, [{ firstName: { contains: "test" } }], "search must preserve manager scope");
    let managerLocation = "A";
    headers.cookies = async () => ({ get: (name: string) => name === SESSION_COOKIE ? { value: signToken({ sub: "manager", tenantId: "T", role: "location_manager" }) } : undefined });
    prisma.employee.findUnique = (async () => ({ id: "manager", tenantId: "T", status: "active", role: "location_manager", mustChangePassword: false, sessionVersion: 0 })) as any;
    prisma.employee.findFirst = (async (args: any) => {
      assert.equal(args.where.tenantId, "T");
      if (args.where.id === "manager") return { locationId: managerLocation };
      assert.deepEqual(args.where.AND, [employeeLocationScope(managerLocation)]);
      return records[0].locationId === managerLocation ? { ...records[0], password: null } : null;
    }) as any;
    const response = await getMaster(new NextRequest("https://crk.peoplenexa.in/api/employees/pending/master"), { params: Promise.resolve({ id: "pending" }) });
    assert.equal(response.status, 200, "manager can open assigned-location pending employee");
    managerLocation = "B";
    assert.equal((await getMaster(new NextRequest("https://crk.peoplenexa.in/api/employees/pending/master"), { params: Promise.resolve({ id: "pending" }) })).status, 404, "another location cannot open the employee");
    const created: any[] = [];
    soap.createClientAsync = async () => ({ GetEmployeeCodesAsync: async ({ EmployeeLocation }: { EmployeeLocation: string }) => [{ GetEmployeeCodesResult: EmployeeLocation === "GROUP_A" ? "100,NEW-A,shared" : EmployeeLocation === "GROUP_B" ? "200,shared" : "100,200,NEW-A,shared" }] });
    prisma.employee.findMany = (async () => [{ deviceCode: "100", employeeNumber: "HR100" }, { deviceCode: "200", employeeNumber: "HR200" }]) as any;
    prisma.employee.createMany = (async (args: any) => { created.push(...args.data); return { count: args.data.length }; }) as any;
    prisma.deviceLog.findMany = (async () => []) as any;
    const imported = await importEmployeesFromEbioserver("T", { url: "https://example.invalid/service", username: "test", passwordEnc: null, enabled: true, pollIntervalMinutes: 15, lastPulledAt: null, lastError: null, lastErrorAt: null, lastLogId: 0 });
    assert.equal(imported.ok, true); assert.equal(imported.created, 2); assert.equal(imported.activated, 0);
    const mapped = created.find(row => row.deviceCode === "NEW-A"), conflict = created.find(row => row.deviceCode === "shared");
    assert.equal(mapped.locationId, "A"); assert.equal(conflict.locationId, null);
    for (const row of created) { assert.equal(row.status, "inactive"); assert.equal(row.password, null); assert.equal(row.email, null); assert.equal(row.branchId, undefined); assert.equal(row.legacyImportData.assignmentPending, true); }
    assert.match(imported.message ?? "", /multiple locations/);
    console.log("Machine employee locations: exact IDs, unique ownership, bounded roster calls, status-preserving repair, manager visibility and scope safety passed.");
  } finally {
    soap.createClientAsync = oldSoapClient; prisma.employee.findMany = saved.many; prisma.employee.createMany = saved.create; prisma.deviceLog.findMany = saved.logs;
    headers.cookies = oldCookies; prisma.device.findMany = saved.devices; prisma.employee.updateMany = saved.update; prisma.auditLog.create = saved.audit; prisma.employee.findFirst = saved.first; prisma.employee.findUnique = saved.employee;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
