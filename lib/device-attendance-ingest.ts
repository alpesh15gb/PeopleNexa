import { prisma } from "./prisma";
import { createPunchForEvent } from "./punch-idempotency";
import { attendanceDayForPunch, reconcileEmployeeDay } from "./reconcile";
import { isTransactionWriteConflict } from "./transaction-conflict";
import { workspaceRegion } from "./workspace-region";

const employeeForAttendance = { id: true, shiftId: true, branchId: true, tenantId: true } as const;

export function isUniqueWriteConflict(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

/** Resume a pending raw log using its original normalized punch if present. */
export async function reconcileDeviceEvent(
  device: { id: string; tenantId: string },
  log: { id: string; userId: string; punchTime: Date },
  source: "device" | "realtime",
  allowResume: boolean,
  inOutMode?: string,
) {
  const { tenantId } = device;
  const eventKey = `${source}-log:${log.id}`;
  const existing = allowResume ? await prisma.punch.findUnique({ where: { eventKey } }) : null;
  let normalized;
  if (existing) {
    normalized = { punch: existing, created: false };
  } else {
    const employee = await prisma.employee.findFirst({
      where: { tenantId, status: "active", OR: [{ deviceCode: log.userId }, { deviceCode: null, employeeNumber: log.userId }] },
      select: { id: true },
    });
    if (!employee) return null;
    const hint = inOutMode?.trim();
    normalized = await createPunchForEvent({
      tenantId, employeeId: employee.id, source, punchTime: log.punchTime, eventKey,
      ...(source === "device" ? { deviceId: device.id } : { realtimeDeviceId: device.id }),
      inOutHint: hint === "5" ? "in" : hint === "1" ? "out" : "unknown",
    });
  }

  const { punch, created } = normalized;
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.findFirst({
          where: { id: punch.employeeId, tenantId },
          select: employeeForAttendance,
        });
        if (!employee) throw new Error("The employee for this recorded punch no longer exists.");
        const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, config: true } });
        const timeZone = workspaceRegion(tenant?.config).timeZone;
        const day = await attendanceDayForPunch(employee, punch.punchTime, timeZone, tx);
        return reconcileEmployeeDay(tenant ?? { id: tenantId, config: null }, employee, day, { finalize: false }, tx);
      }, { isolationLevel: "Serializable" });
      return { created, result };
    } catch (error) {
      if (attempt === 2 || !(isUniqueWriteConflict(error) || isTransactionWriteConflict(error))) throw error;
    }
  }
}

export const PENDING_DEVICE_ATTENDANCE = "Attendance processing failed. This punch can be retried.";
