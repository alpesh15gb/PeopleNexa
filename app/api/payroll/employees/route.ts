import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, payrollOperationLocationId } from "@/lib/location-scope";
import { isMonthKey } from "@/lib/dates";

const PAGE_SIZE = 25;

/** A bounded picker feed. Authorization and location membership are never client-derived. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonthKey(month)) return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  const scope = await payrollOperationLocationId(session, req.nextUrl.searchParams.get("locationId"));
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const search = (req.nextUrl.searchParams.get("search") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const searchWhere = search ? { OR: [
    { employeeNumber: { contains: search, mode: "insensitive" as const } },
    { firstName: { contains: search, mode: "insensitive" as const } },
    { lastName: { contains: search, mode: "insensitive" as const } },
    { position: { contains: search, mode: "insensitive" as const } },
    { department: { name: { contains: search, mode: "insensitive" as const } } },
  ] } : {};
  const where = { tenantId: session.tenantId, status: "active", loginOnly: false, ...employeeLocationScope(scope.locationId), ...searchWhere };
  const [employees, total] = await Promise.all([
    prisma.employee.findMany({ where, orderBy: [{ employeeNumber: "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, employeeNumber: true, firstName: true, lastName: true, position: true, salary: true, joiningDate: true, department: { select: { name: true } } } }),
    prisma.employee.count({ where }),
  ]);
  const monthEnd = new Date(`${month}-01T00:00:00.000Z`); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  return NextResponse.json({ employees: employees.map((employee) => ({
    ...employee,
    eligible: employee.salary != null && employee.salary > 0 && (!employee.joiningDate || employee.joiningDate < monthEnd),
    eligibility: employee.salary == null || employee.salary <= 0 ? "No current salary" : employee.joiningDate && employee.joiningDate >= monthEnd ? "Joins after this month" : "Eligible",
  })), page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) });
}
