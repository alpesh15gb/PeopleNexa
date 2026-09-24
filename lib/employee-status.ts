import type { EbioAccessEnforcementResult } from "@/lib/ebioserver";

type StatusEmployee = { id: string; status: string };

/**
 * Employment activation deliberately does not restore biometric access. Device
 * access remains an explicit policy decision made from the device access UI.
 */
export async function applyEmployeeStatusChange<T extends StatusEmployee>({
  employee,
  status,
  updateStatus,
  enforceDeviceBlock,
}: {
  employee: T;
  status: "active" | "inactive";
  updateStatus: () => Promise<T>;
  enforceDeviceBlock: (employeeId: string) => Promise<EbioAccessEnforcementResult[]>;
}) {
  const updated = await updateStatus();
  const deviceResults = status === "inactive" && employee.status !== "inactive"
    ? await enforceDeviceBlock(updated.id)
    : [];
  return {
    employee: updated,
    deviceResults,
    deviceFailures: deviceResults.filter((result) => result.status === "failed"),
  };
}
