import type { Prisma } from "@/generated/prisma/client";

export async function reportingManagerCreatesCycle(
  db: Pick<Prisma.TransactionClient, "employee">,
  tenantId: string,
  employeeId: string,
  managerId: string,
) {
  const visited = new Set([employeeId]);
  let current: string | null = managerId;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    const link: { managerId: string | null } | null = await db.employee.findFirst({
      where: { tenantId, id: current },
      select: { managerId: true },
    });
    current = link?.managerId ?? null;
  }
  return false;
}
