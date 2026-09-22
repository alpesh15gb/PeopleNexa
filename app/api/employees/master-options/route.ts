import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager", "branch_manager"].includes(session.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const actor = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    select: { locationId: true, branchId: true },
  });
  if (session.role === "location_manager" && !actor?.locationId) {
    return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  }
  if (session.role === "branch_manager" && !actor?.branchId) {
    return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
  }
  const locationId = actor?.locationId ?? null;
  const branchId = actor?.branchId ?? null;

  const employeeScope = session.role === "location_manager"
    ? { branch: { locationId: locationId! } }
    : session.role === "branch_manager"
      ? { branchId: branchId! }
      : {};
  const branchScope = session.role === "location_manager" ? { locationId: locationId! } : session.role === "branch_manager" ? { id: branchId! } : {};
  const [branches, departments, shifts, managers, designations, subdepartments] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId: session.tenantId, ...branchScope }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.shift.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { tenantId: session.tenantId, loginOnly: false, status: "active", ...employeeScope }, select: { id: true, firstName: true, lastName: true, employeeNumber: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
    prisma.designation.findMany({ where: { tenantId: session.tenantId, active: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.employeeEmploymentProfile.findMany({ where: { subDepartment: { not: null }, employee: { tenantId: session.tenantId, loginOnly: false, departmentId: { not: null }, ...employeeScope } }, select: { subDepartment: true, employee: { select: { departmentId: true } } } }),
  ]);
  const subdepartmentsByDepartment = subdepartments.reduce<Record<string, string[]>>((result, row) => {
    const departmentId = row.employee.departmentId;
    if (departmentId && row.subDepartment && !result[departmentId]?.includes(row.subDepartment)) {
      (result[departmentId] ??= []).push(row.subDepartment);
    }
    return result;
  }, {});
  for (const values of Object.values(subdepartmentsByDepartment)) values.sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    branches,
    departments,
    shifts,
    managers,
    positions: designations.map((row) => row.name),
    subdepartments: [...new Set(subdepartments.flatMap((row) => row.subDepartment ? [row.subDepartment] : []))].sort((a, b) => a.localeCompare(b)),
    subdepartmentsByDepartment,
  });
}
