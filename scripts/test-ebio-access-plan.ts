import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { PATCH as retryBlocks, PUT as saveAccess } from "../app/api/employees/[id]/device-access/route";
import { SESSION_COOKIE, signToken } from "../lib/auth";
import { canRetryEbioBlock, EBIO_BLOCK_RETRY_LEASE_MS, needsEbioAccessCommand } from "../lib/ebio-access-plan";
import { encryptSecret } from "../lib/encrypt";
import { prisma } from "../lib/prisma";

for (const allowed of [true, false]) {
  assert.equal(needsEbioAccessCommand(undefined, allowed), true);
  assert.equal(needsEbioAccessCommand({ deviceId: "mnp", allowed, commandStatus: "sent" }, allowed), false);
  assert.equal(needsEbioAccessCommand({ deviceId: "mnp", allowed: !allowed, commandStatus: "sent" }, allowed), true);
  for (const commandStatus of ["failed", "pending"]) {
    assert.equal(needsEbioAccessCommand({ deviceId: "mnp", allowed, commandStatus }, allowed), true);
  }
}

const now = new Date();
const stale = new Date(now.getTime() - EBIO_BLOCK_RETRY_LEASE_MS);
assert.equal(canRetryEbioBlock({ allowed: false, commandStatus: "failed", lastCommandAt: now }, now), true);
assert.equal(canRetryEbioBlock({ allowed: false, commandStatus: "pending", lastCommandAt: null }, now), true);
assert.equal(canRetryEbioBlock({ allowed: false, commandStatus: "pending", lastCommandAt: stale }, now), true);
assert.equal(canRetryEbioBlock({ allowed: false, commandStatus: "pending", lastCommandAt: now }, now), false);
assert.equal(canRetryEbioBlock({ allowed: false, commandStatus: "sent", lastCommandAt: stale }, now), false);
assert.equal(canRetryEbioBlock({ allowed: true, commandStatus: "failed", lastCommandAt: stale }, now), false);

async function testInactiveRetry() {
  const require = createRequire(import.meta.url);
  const headers = require("next/headers");
  const soap = require("soap");
  const oldCookies = headers.cookies;
  const oldSoap = soap.createClientAsync;
  const oldKey = process.env.EBIO_ENCRYPTION_KEY;
  const oldReadSession = prisma.employee.findUnique;
  const oldReadEmployee = prisma.employee.findFirst;
  const oldReadTenant = prisma.tenant.findUniqueOrThrow;
  const oldReadPolicies = prisma.employeeDeviceAccess.findMany;
  const oldUpdatePolicies = prisma.employeeDeviceAccess.updateMany;
  const oldAudit = prisma.auditLog.create;

  const tenantId = "tenant-test";
  const employeeId = "employee-test";
  const actorId = "reviewer-test";
  const locationId = "location-test";
  const deviceCode = "staff-test";
  let role = "location_manager";
  let employeeStatus = "inactive";
  let canAccessEmployee = true;
  let integrationEnabled = true;
  const policies = [
    { id: "first", commandStatus: "failed", lastCommandAt: now },
    { id: "second", commandStatus: "pending", lastCommandAt: null },
    { id: "third", commandStatus: "sent", lastCommandAt: now },
  ].map((policy) => ({ ...policy, allowed: false, device: { id: `device-${policy.id}`, name: policy.id, serialNumber: policy.id } }));
  const calls: Array<{ DeviceSerialNumber: string; EmployeeCode: string; BlockUser: boolean }> = [];
  const auditedDevices: string[] = [];
  const url = "http://localhost/api/employees/employee-test/device-access";
  const params = Promise.resolve({ id: employeeId });
  const retry = () => retryBlocks(new NextRequest(url, { method: "PATCH" }), { params });

  try {
    process.env.EBIO_ENCRYPTION_KEY = "fixture-ebio-credential-key";
    const passwordEnc = encryptSecret("fixture-only-password");
    headers.cookies = async () => ({ get: (key: string) => key === SESSION_COOKIE ? { value: signToken({ sub: actorId, role, tenantId }) } : undefined });
    prisma.employee.findUnique = (async () => ({ id: actorId, status: "active", tenantId, role, sessionVersion: 0 })) as unknown as typeof oldReadSession;
    prisma.employee.findFirst = (async ({ where }: { where: { id: string; tenantId: string; OR?: unknown[] } }) => {
      assert.equal(where.tenantId, tenantId);
      if (where.id === actorId) return { locationId };
      if (role === "location_manager") assert.ok(where.OR?.length);
      return canAccessEmployee ? { status: employeeStatus, deviceCode } : null;
    }) as unknown as typeof oldReadEmployee;
    prisma.tenant.findUniqueOrThrow = (async () => ({ config: { ebioserver: { url: "https://example.invalid/fixture", username: "test-user", passwordEnc, enabled: integrationEnabled } } })) as unknown as typeof oldReadTenant;
    prisma.employeeDeviceAccess.findMany = (async ({ where }: { where: Record<string, unknown> }) => {
      assert.equal(where.tenantId, tenantId);
      assert.equal(where.employeeId, employeeId);
      assert.equal(where.allowed, false);
      assert.deepEqual(where.device, { tenantId, status: "active", config: { path: ["ebioserver"], equals: true }, branch: { locationId } });
      assert.equal((where.employee as { status: string }).status, "inactive");
      return policies.filter((policy) => canRetryEbioBlock(policy)).map((policy) => ({ ...policy }));
    }) as unknown as typeof oldReadPolicies;
    prisma.employeeDeviceAccess.updateMany = (async ({ where, data }: { where: { id: string; allowed: boolean; commandStatus: string; lastCommandAt: Date | null }; data: object }) => {
      const policy = policies.find((row) => row.id === where.id && row.allowed === where.allowed && row.commandStatus === where.commandStatus && row.lastCommandAt?.getTime() === where.lastCommandAt?.getTime());
      if (policy) Object.assign(policy, data);
      return { count: Number(Boolean(policy)) };
    }) as unknown as typeof oldUpdatePolicies;
    prisma.auditLog.create = (async ({ data }: { data: { after: { results: Array<{ deviceId: string }> } } }) => {
      auditedDevices.push(...data.after.results.map((result) => result.deviceId));
      return data;
    }) as unknown as typeof oldAudit;
    soap.createClientAsync = async () => ({ DeviceCommand_BlockUnBlockUserAsync: async ({ DeviceSerialNumber, EmployeeCode, BlockUser }: (typeof calls)[number]) => {
      calls.push({ DeviceSerialNumber, EmployeeCode, BlockUser });
      if (DeviceSerialNumber === "second") throw new Error("Device fixture unavailable");
      return [{ DeviceCommand_BlockUnBlockUserResult: "accepted" }];
    } });

    role = "employee";
    assert.equal((await retry()).status, 401);
    role = "location_manager";
    canAccessEmployee = false;
    assert.equal((await retry()).status, 404);
    canAccessEmployee = true;
    employeeStatus = "active";
    assert.equal((await retry()).status, 409);
    employeeStatus = "inactive";
    const grant = new NextRequest(url, { method: "PUT", body: JSON.stringify({ mode: "all", deviceIds: [] }) });
    assert.equal((await saveAccess(grant, { params })).status, 409);
    integrationEnabled = false;
    assert.equal((await retry()).status, 409);
    assert.equal(calls.length, 0);
    integrationEnabled = true;

    const responses = await Promise.all([retry(), retry()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 207]);
    assert.deepEqual(calls.map((call) => call.DeviceSerialNumber).sort(), ["first", "second"]);
    assert.ok(calls.every((call) => call.BlockUser && call.EmployeeCode === deviceCode));
    assert.deepEqual(policies.map((policy) => policy.commandStatus), ["sent", "failed", "sent"]);
    assert.deepEqual(auditedDevices.sort(), ["device-first", "device-second"]);
    assert.equal((await retry()).status, 207);
    assert.equal(calls.at(-1)?.DeviceSerialNumber, "second");
  } finally {
    headers.cookies = oldCookies;
    soap.createClientAsync = oldSoap;
    if (oldKey === undefined) delete process.env.EBIO_ENCRYPTION_KEY;
    else process.env.EBIO_ENCRYPTION_KEY = oldKey;
    prisma.employee.findUnique = oldReadSession;
    prisma.employee.findFirst = oldReadEmployee;
    prisma.tenant.findUniqueOrThrow = oldReadTenant;
    prisma.employeeDeviceAccess.findMany = oldReadPolicies;
    prisma.employeeDeviceAccess.updateMany = oldUpdatePolicies;
    prisma.auditLog.create = oldAudit;
  }
}

testInactiveRetry().then(() => console.log("eBio command policy and inactive block retry tests passed"), (error) => { console.error(error); process.exitCode = 1; });
