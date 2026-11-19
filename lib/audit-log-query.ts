import type { Prisma } from "@/generated/prisma/client";
import { recordPagination } from "@/lib/document-expense-pagination";
import { prisma } from "@/lib/prisma";

export function auditFilters(params: { action?: unknown; entity?: unknown; q?: unknown }) {
  const read = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 200) : "";
  return { action: read(params.action), entity: read(params.entity), q: read(params.q) };
}

export async function auditLogPage(tenantId: string, { action, entity, q }: ReturnType<typeof auditFilters>, page: number, pageSize = 50) {
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
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
