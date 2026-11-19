import type { Prisma } from "@/generated/prisma/client";

export async function nextEmployeeNumber(
  db: Pick<Prisma.TransactionClient, "employee">,
  tenantId: string,
  prefix: "EMP" | "MGR",
  first: number,
) {
  for (let index = first; ; index++) {
    const code = `${prefix}-${String(index).padStart(3, "0")}`;
    const used = await db.employee.findFirst({ where: { tenantId, employeeNumber: { equals: code, mode: "insensitive" } }, select: { id: true } });
    if (!used) return code;
  }
}
