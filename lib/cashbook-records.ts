import { recordPagination } from "./document-expense-pagination";
import { prisma } from "./prisma";

export async function cashbookRecords(tenantId: string, locationId: string | null, month: string | null, requestedPage: number, pageSize?: number) {
  const start = month ? new Date(`${month}-01T00:00:00Z`) : null;
  const end = start ? new Date(start) : null;
  if (end) end.setUTCMonth(end.getUTCMonth() + 1);
  const where = {
    tenantId,
    ...(locationId ? { locationId } : {}),
    ...(start && end ? { date: { gte: start, lt: end } } : {}),
  };
  return prisma.$transaction(async (tx) => {
    const groups = await tx.cashbookEntry.groupBy({ by: ["type"], where, _sum: { amount: true }, _count: { _all: true } });
    const cashInGroup = groups.find((group) => group.type === "cash_in");
    const cashOutGroup = groups.find((group) => group.type === "cash_out");
    const cashIn = cashInGroup?._sum.amount ?? 0;
    const cashOut = cashOutGroup?._sum.amount ?? 0;
    const pagination = recordPagination(groups.reduce((count, group) => count + group._count._all, 0), requestedPage, pageSize);
    const entries = await tx.cashbookEntry.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], skip: pagination.offset, take: pagination.pageSize });
    return {
      entries, pagination,
      summary: { cashIn, cashOut, balance: cashIn - cashOut, cashInCount: cashInGroup?._count._all ?? 0, cashOutCount: cashOutGroup?._count._all ?? 0 },
    };
  }, { isolationLevel: "RepeatableRead" });
}
