import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { encryptSecret } from "../lib/encrypt";
import { signToken, SESSION_COOKIE } from "../lib/auth";
import { PUT } from "../app/api/employees/[id]/device-access/route";

async function main() {
  const require = createRequire(import.meta.url);
  const headers = require("next/headers"), soap = require("soap");
  const restore: Array<() => void> = [];
  function mock(object: any, key: string, value: any) {
    const original = object[key]; restore.push(() => { object[key] = original; }); object[key] = value;
  }
  const oldKey = process.env.EBIO_ENCRYPTION_KEY;
  process.env.EBIO_ENCRYPTION_KEY = "test-only-encryption-key";
  let status = "active", provision = "success";
  let policies: any[] = [];
  const commands: any[] = [], provisions: any[] = [];
  const devices = ["A", "B"].map(id => ({ id, name: id, serialNumber: id, config: { locationCode: "MNP" } }));
  try {
    mock(headers, "cookies", async () => ({ get: (name: string) => name === SESSION_COOKIE ? { value: signToken({ sub: "admin", tenantId: "T", role: "admin" }) } : undefined }));
    mock(prisma.employee, "findUnique", async () => ({ id: "admin", tenantId: "T", status: "active", role: "admin", mustChangePassword: false, sessionVersion: 0 }));
    mock(prisma.employee, "findFirst", async (args: any) => { assert.equal(args.where.tenantId, "T"); return { id: "employee", deviceCode: "4523", firstName: "Test", lastName: "", status }; });
    mock(prisma.tenant, "findUnique", async () => ({ config: { ebioserver: { enabled: true, url: "https://example.invalid", username: "test", passwordEnc: encryptSecret("test") } } }));
    mock(prisma.device, "findMany", async (args: any) => { assert.equal(args.where.tenantId, "T"); return devices; });
    mock(prisma.employeeDeviceAccess, "findMany", async () => policies.map(row => ({ ...row })));
    mock(prisma.employee, "update", async () => ({}));
    mock(prisma.employeeDeviceAccess, "upsert", async (args: any) => {
      const id = args.where.employeeId_deviceId.deviceId;
      const row = policies.find(row => row.deviceId === id);
      if (row) Object.assign(row, args.update); else policies.push({ ...args.create });
      return {};
    });
    mock(prisma.employeeDeviceAccess, "update", async (args: any) => { Object.assign(policies.find(row => row.deviceId === args.where.employeeId_deviceId.deviceId), args.data); return {}; });
    mock(prisma.ebioEmployeeProvision, "upsert", async () => ({}));
    mock(prisma.auditLog, "create", async () => ({}));
    mock(prisma, "$transaction", async (queries: any[]) => Promise.all(queries));
    mock(soap, "createClientAsync", async () => ({
      UpdateEmployeeAsync: async (args: any) => { provisions.push(args); return [{ UpdateEmployeeResult: provision }]; },
      DeviceCommand_BlockUnBlockUserAsync: async (args: any) => { commands.push(args); return [{ DeviceCommand_BlockUnBlockUserResult: "success" }]; },
    }));
    async function save(deviceIds: string[]) {
      return PUT(new NextRequest("https://example.invalid/api/employees/employee/device-access", { method: "PUT", body: JSON.stringify({ mode: "restricted", deviceIds }) }), { params: Promise.resolve({ id: "employee" }) });
    }
    assert.equal((await save(["A"])).status, 200);
    assert.deepEqual(commands.map(row => [row.DeviceSerialNumber, row.BlockUser]), [["A", false], ["B", true]]);
    assert.equal(provisions.length, 1, "provision once per location");
    commands.length = 0; provisions.length = 0;
    const unchanged = await (await save(["A"])).json();
    assert.ok(unchanged.results.every((row: any) => row.status === "unchanged"));
    assert.equal(commands.length, 0); assert.equal(provisions.length, 0);
    policies[0].commandStatus = "failed";
    provision = "error";
    assert.equal((await save(["A"])).status, 207);
    assert.deepEqual(commands.map(row => [row.DeviceSerialNumber, row.BlockUser]), [["A", true]], "failed provisioning must never unblock");
    assert.equal(policies[0].commandStatus, "failed");
    provision = "success"; commands.length = 0;
    assert.equal((await save(["A"])).status, 200);
    assert.deepEqual(commands.map(row => [row.DeviceSerialNumber, row.BlockUser]), [["A", false]], "failed policy remains retryable");
    commands.length = 0; status = "inactive";
    assert.equal((await save(["A"])).status, 409); assert.equal(commands.length, 0);
    status = "active";
    assert.equal((await save(["foreign-device"])).status, 400); assert.equal(commands.length, 0);
    console.log("eBio route tests passed: selected access, deduplication, provisioning failure/retry, inactive and foreign device guards");
  } finally {
    restore.reverse().forEach(fn => fn());
    if (oldKey === undefined) delete process.env.EBIO_ENCRYPTION_KEY; else process.env.EBIO_ENCRYPTION_KEY = oldKey;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
