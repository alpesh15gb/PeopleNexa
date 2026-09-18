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
    return { punch: await prisma.punch.create({ data }), created: true };
  } catch (error) {
    if (prismaErrorCode(error) !== "P2002") throw error;
    const punch = await prisma.punch.findUnique({ where: { eventKey: data.eventKey } });
    if (!punch) throw error;
    return { punch, created: false };
  }
}
