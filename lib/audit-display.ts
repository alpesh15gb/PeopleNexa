import type { AuditLog } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export function readableAuditCode(value: string): string {
  const labels: Record<string, string> = {
    "face.review": "Face review", "punch.authorization": "Mobile punch decision",
    "punch.held": "Punch awaiting approval", "punch.auto_accepted": "Punch automatically approved",
    "employee.update": "Employee updated", "employee.status.recovery": "Employee status restored",
    no_enrollment: "Face ID not enrolled", location_not_configured: "Branch geofence not configured",
    location_mismatch: "Outside branch geofence", location_accuracy: "Location accuracy insufficient",
    face_mismatch: "Face did not match", face_review: "Face verification uncertain",
  };
  return labels[value] ?? value.replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
export function auditTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}
type Identity = { id: string; firstName: string; lastName: string; employeeNumber: string | null };
export function auditEmployeeLabel(employee: Identity): string {
  return `${employee.firstName} ${employee.lastName}`.trim() + ` (${employee.employeeNumber || employee.id})`;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function snapshot(row: AuditLog): Record<string, unknown> {
  const after = object(row.after), before = object(row.before);
  return row.entity === "Employee" ? { ...before, ...after, id: row.entityId } : { ...object(before.employee), ...object(after.employee) };
}
/** Resolve references only inside the authenticated tenant; retain original evidence. */
export async function enrichAuditEntries(rows: AuditLog[], tenantId: string) {
  const safeRows = rows.filter(row => row.tenantId === tenantId);
  const punchIds = safeRows.filter(row => row.entity === "Punch").map(row => row.entityId);
  const punches = punchIds.length ? await prisma.punch.findMany({ where: { tenantId, id: { in: punchIds } }, select: { id: true, employeeId: true } }) : [];
  const punchEmployees = new Map(punches.map(p => [p.id, p.employeeId]));
  function subjectId(row: AuditLog): string | undefined {
    if (row.entity === "Employee") return row.entityId;
    const saved = snapshot(row);
    const direct = object(row.after).employeeId ?? object(row.before).employeeId;
    if (typeof saved.id === "string") return saved.id;
    if (typeof direct === "string") return direct;
    if (row.entity === "Punch") return punchEmployees.get(row.entityId) ?? row.summary.match(/\bfor (c[a-z0-9]{20,30})\b/)?.[1];
    return undefined;
  }
  const ids = [...new Set(safeRows.flatMap(row => [row.actorId, subjectId(row)].filter((id): id is string => !!id)))];
  const employees = ids.length ? await prisma.employee.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true, employeeNumber: true } }) : [];
  const byId = new Map(employees.map(e => [e.id, e]));
  return safeRows.map(row => {
    const id = subjectId(row), current = id ? byId.get(id) : undefined, saved = snapshot(row);
    const employee = typeof saved.firstName === "string" && id ? {
      id, firstName: saved.firstName, lastName: typeof saved.lastName === "string" ? saved.lastName : "",
      employeeNumber: typeof saved.employeeNumber === "string" ? saved.employeeNumber : current?.employeeNumber ?? null,
    } : current;
    const actor = byId.get(row.actorId);
    const employeeLabel = employee ? auditEmployeeLabel(employee) : id ?? null;
    let summary = row.summary;
    if (employeeLabel && id) summary = summary.replaceAll(id, employeeLabel);
    summary = summary.replace(/\((no_enrollment|location_not_configured|location_mismatch|location_accuracy|face_mismatch|face_review)\)/g, (_, reason: string) => `(${readableAuditCode(reason)})`);
    const before = object(row.before), after = object(row.after);
    const fields: Record<string, string> = { firstName: "First name", lastName: "Last name", employeeNumber: "Employee code", deviceCode: "Device code", status: "Employment status", role: "Role", authStatus: "Punch approval", faceStatus: "Face verification" };
    const changes = Object.entries(fields).flatMap(([key, label]) => {
      if (!(key in before) || !(key in after) || before[key] === after[key]) return [];
      const display = (value: unknown) => value == null || value === "" ? "Not set" : String(value).replaceAll("_", " ");
      return [`${label}: ${display(before[key])} -> ${display(after[key])}`];
    });
    return { ...row, changes, actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : null,
      actorLabel: actor ? auditEmployeeLabel(actor) : row.actorId,
      actorRoleLabel: readableAuditCode(row.actorRole), employeeLabel,
      actionLabel: readableAuditCode(row.action), readableSummary: summary || "—" };
  });
}
