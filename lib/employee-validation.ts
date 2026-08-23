import { prisma } from "./prisma";

export const PAY_MODES = new Set(["monthly", "daily", "weekly", "hourly", "work_basis"]);

export function parseOptionalMoney(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) throw new Error(`${field} must be a valid non-negative amount.`);
  return n;
}

export function validateSalaryStructure(value: unknown): Record<string, number> | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid salary structure.");
  const allowed = ["basic", "hra", "conveyance", "medical", "other"] as const;
  const out: Record<string, number> = {};
  for (const key of allowed) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) throw new Error(`Salary component ${key} is invalid.`);
    out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function validatePayMode(value: unknown): string {
  const mode = String(value ?? "monthly");
  if (!PAY_MODES.has(mode)) throw new Error("Invalid pay mode.");
  return mode;
}

export async function validateEmployeeReferences(
  tenantId: string,
  refs: { branchId?: unknown; departmentId?: unknown; shiftId?: unknown; managerId?: unknown },
  employeeId?: string
) {
  const branchId = refs.branchId ? String(refs.branchId) : null;
  const departmentId = refs.departmentId ? String(refs.departmentId) : null;
  const shiftId = refs.shiftId ? String(refs.shiftId) : null;
  const managerId = refs.managerId ? String(refs.managerId) : null;
  if (employeeId && managerId === employeeId) throw new Error("An employee cannot be their own manager.");

  const [branch, department, shift, manager] = await Promise.all([
    branchId ? prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } }) : null,
    departmentId ? prisma.department.findFirst({ where: { id: departmentId, tenantId }, select: { id: true } }) : null,
    shiftId ? prisma.shift.findFirst({ where: { id: shiftId, tenantId }, select: { id: true } }) : null,
    managerId ? prisma.employee.findFirst({ where: { id: managerId, tenantId, status: "active" }, select: { id: true } }) : null,
  ]);
  if (branchId && !branch) throw new Error("Selected branch does not belong to this workspace.");
  if (departmentId && !department) throw new Error("Selected department does not belong to this workspace.");
  if (shiftId && !shift) throw new Error("Selected shift does not belong to this workspace.");
  if (managerId && !manager) throw new Error("Selected manager is not an active employee in this workspace.");
  return { branchId, departmentId, shiftId, managerId };
}

export function parseJoiningDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid joining date.");
  return d;
}
