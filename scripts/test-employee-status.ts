import assert from "node:assert/strict";
import { applyEmployeeStatusChange } from "../lib/employee-status";

const failedBlock = {
  deviceId: "device-1",
  name: "Front gate",
  allowed: false,
  status: "failed" as const,
  error: "eBio unavailable",
};

// The database status is committed before a failed eBio command is reported,
// so admins can retry the device policy without losing the employment change.
async function run() {
  let savedStatus = "active";
  const inactive = await applyEmployeeStatusChange({
    employee: { id: "employee-1", status: "active" },
    status: "inactive",
    updateStatus: async () => ({ id: "employee-1", status: (savedStatus = "inactive") }),
    enforceDeviceBlock: async () => [failedBlock],
  });
  assert.equal(savedStatus, "inactive");
  assert.deepEqual(inactive.deviceFailures, [failedBlock]);

  // Reactivation is employment-only: it must not silently unblock any device.
  let blockCalls = 0;
  const active = await applyEmployeeStatusChange({
    employee: { id: "employee-1", status: "inactive" },
    status: "active",
    updateStatus: async () => ({ id: "employee-1", status: "active" }),
    enforceDeviceBlock: async () => {
      blockCalls++;
      return [];
    },
  });
  assert.equal(active.employee.status, "active");
  assert.equal(blockCalls, 0);

  console.log("employee direct status lifecycle tests passed");
}

void run();
