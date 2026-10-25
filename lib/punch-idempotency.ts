import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

function prismaErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

/** Appends one normalized punch for one immutable source event. */
export async function createPunchForEvent(data: Prisma.PunchUncheckedCreateInput & { eventKey: string }) {
  try {
    return await prisma.$transaction(async tx => {
      const punch = await tx.punch.create({ data });
      await tx.attendanceReconcileJob.create({ data: { tenantId: punch.tenantId, employeeId: punch.employeeId, punchId: punch.id } });
      return { punch, created: true };
    });
  } catch (error) {
    if (prismaErrorCode(error) !== "P2002") throw error;
    const punch = await prisma.punch.findUnique({ where: { eventKey: data.eventKey } });
    if (!punch) throw error;
    if (punch.tenantId !== data.tenantId || punch.employeeId !== data.employeeId) throw new Error("Source event is already assigned to a different employee or workspace.");
    // Heal an interrupted/legacy event without creating another source punch.
    await prisma.attendanceReconcileJob.upsert({
      where: { punchId: punch.id },
      create: { tenantId: punch.tenantId, employeeId: punch.employeeId, punchId: punch.id },
      update: { status: "pending", version: { increment: 1 }, nextAttemptAt: new Date(), lastError: null },
    });
    return { punch, created: false };
  }
}
