import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";

/** Returns the manager's assigned location. A missing assignment is never unscoped. */
export async function managerLocationId(session: SessionPayload) {
  if (session.role !== "location_manager") return null;
  return (await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId, status: "active" },
    select: { locationId: true },
  }))?.locationId ?? null;
}

export function employeeLocationScope(locationId: string) {
  return { branch: { locationId } };
}
