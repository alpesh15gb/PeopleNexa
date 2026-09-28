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
  // Branch membership is authoritative. The legacy employee location applies
  // only to employees who have not yet been assigned a branch.
  return { OR: [{ branch: { locationId } }, { branchId: null, locationId }] };
}

/** A payroll operation always has one active location, including for admins. */
export async function payrollOperationLocationId(session: SessionPayload, requestedLocationId?: string | null) {
  const requested = requestedLocationId?.trim() || null;
  const assigned = await managerLocationId(session);
  if (session.role === "location_manager" && !assigned) return { error: "no location assigned" } as const;
  if (session.role === "admin" && !requested) return { error: "A specific active location is required for payroll operations." } as const;
  if (session.role === "location_manager" && requested && requested !== assigned) return { error: "Location managers can operate payroll only for their assigned location." } as const;
  const locationId = session.role === "location_manager" ? assigned! : requested!;
  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: session.tenantId, isActive: true }, select: { id: true } });
  return location ? { locationId: location.id } as const : { error: "Select an active location in this tenant." } as const;
}
