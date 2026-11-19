import type { Prisma } from "@/generated/prisma/client";
import { recordPagination } from "@/lib/document-expense-pagination";
import { prisma } from "@/lib/prisma";
import { isDateKey } from "@/lib/dates";
import { timeZoneDayRange } from "@/lib/workspace-time";
import { DEFAULT_WORKSPACE_REGION } from "@/lib/workspace-region";

export function auditFilters(params: { action?: unknown; entity?: unknown; q?: unknown; from?: unknown; to?: unknown }) {
  const read = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 200) : "";
  return { action: read(params.action), entity: read(params.entity), q: read(params.q), from: read(params.from), to: read(params.to) };
}

export function auditRangeInvalid({ from, to }: Pick<ReturnType<typeof auditFilters>, "from" | "to">) {
  return Boolean((from && !isDateKey(from)) || (to && !isDateKey(to)) || (from && to && from > to));
}

export async function auditLogPage(tenantId: string, { action, entity, q, from, to }: ReturnType<typeof auditFilters>, page: number, pageSize = 50, timeZone = DEFAULT_WORKSPACE_REGION.timeZone) {
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: timeZoneDayRange(from, timeZone).start } : {}), ...(to ? { lt: timeZoneDayRange(to, timeZone).end } : {}) } } : {}),
    ...(q ? { OR: [{ entityId: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : {}),
  };
  return prisma.$transaction(async (tx) => {
    const pagination = recordPagination(await tx.auditLog.count({ where }), page, pageSize);
    const rows = await tx.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.offset,
      take: pageSize,
    });
    return { rows, pagination };
  }, { isolationLevel: "RepeatableRead" });
}
