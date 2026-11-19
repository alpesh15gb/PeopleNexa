import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function expenseSummary(where: Prisma.ExpenseClaimWhereInput) {
  const groups = await prisma.expenseClaim.groupBy({ where, by: ["status"], _count: { _all: true }, _sum: { amount: true } });
  const byStatus = new Map(groups.map((group) => [group.status, group]));
  const total = groups.reduce((count, group) => count + group._count._all, 0);
  return { total, byStatus };
}
