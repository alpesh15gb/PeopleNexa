import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
export const UNASSIGNED_SHIFT_POLICY_KIND = "unassigned_shift_attendance";
export async function unassignedSinglePunchHalfDay(tenantId: string, db: Prisma.TransactionClient = prisma) {
  const record = await db.configurationRecord.findFirst({ where: { tenantId, kind: UNASSIGNED_SHIFT_POLICY_KIND, scopeKey: "tenant", active: true } });
  const payload = record?.payload as { singlePunchHalfDay?: unknown } | undefined;
  return payload?.singlePunchHalfDay === true;
}
