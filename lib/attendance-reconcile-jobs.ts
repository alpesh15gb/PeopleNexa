import { prisma } from "./prisma";
import { attendanceDayForPunch, reconcileEmployeeDay } from "./reconcile";

/** Bounded, restart-safe worker. Only local database reads/writes; no device calls. */
export async function processAttendanceReconcileJobs(tenantId: string, limit = 100) {
  const now = new Date();
  const jobs = await prisma.attendanceReconcileJob.findMany({
    where: { tenantId, status: { in: ["pending", "failed", "processing"] }, nextAttemptAt: { lte: now } },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: Math.min(500, Math.max(1, limit)),
    include: { punch: { select: { id: true, tenantId: true, employeeId: true, punchTime: true, authStatus: true, employee: { select: { id: true, tenantId: true, shiftId: true, branchId: true, locationId: true } } } } },
  });
  const counts = { completed: 0, failed: 0, blocked: 0 };
  for (const job of jobs) {
    const claimed = await prisma.attendanceReconcileJob.updateMany({
      where: { id: job.id, tenantId, version: job.version, status: job.status, nextAttemptAt: job.nextAttemptAt },
      data: { status: "processing", attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 120_000) },
    });
    if (!claimed.count) continue;
    let status = "done", error: string | null = null;
    try {
      const { punch } = job;
      if (punch.tenantId !== tenantId || punch.employee.tenantId !== tenantId || punch.employeeId !== job.employeeId) throw new Error("Reconciliation scope mismatch.");
      if (!["auto", "approved", "declined"].includes(punch.authStatus)) {
        status = "blocked"; error = "Punch is not authorized; no attendance was granted.";
      } else {
        const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, config: true } });
        const day = await attendanceDayForPunch(punch.employee, punch.punchTime);
        const result = await reconcileEmployeeDay(tenant, punch.employee, day);
        if (result.protected) { status = "blocked"; error = "Attendance is protected by a finalized decision or locked payroll; an authorized review is required."; }
      }
    } catch (caught) {
      status = "failed"; error = caught instanceof Error ? caught.message : "Attendance reconciliation failed.";
    }
    const saved = await prisma.attendanceReconcileJob.updateMany({
      where: { id: job.id, tenantId, version: job.version, status: "processing" },
      data: { status, lastError: error, nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 10_000 * 2 ** Math.min(job.attempts, 8))) },
    });
    if (saved.count) counts[status === "done" ? "completed" : status === "blocked" ? "blocked" : "failed"]++;
  }
  return counts;
}
