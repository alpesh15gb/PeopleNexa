import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, payrollOperationLocationId } from "@/lib/location-scope";
import { isMonthKey } from "@/lib/dates";
import { payrollPreparationEnd } from "@/lib/payroll-prepare";

const PAGE_SIZE = 25;

/** A bounded picker feed. Authorization and location membership are never client-derived. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonthKey(month)) return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  const scope = await payrollOperationLocationId(session, req.nextUrl.searchParams.get("locationId"));
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const runId = req.nextUrl.searchParams.get("runId");
  if (runId && !(await prisma.payrollRun.findFirst({ where: { id: runId, tenantId: session.tenantId, locationId: scope.locationId, month, status: "draft" }, select: { id: true } }))) {
    return NextResponse.json({ error: "Draft payroll not found for this location and month." }, { status: 404 });
  }
  const search = (req.nextUrl.searchParams.get("search") ?? "").trim().slice(0, 100);
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * PAGE_SIZE > 2_147_483_647) {
    return NextResponse.json({ error: "Enter a valid employee page number." }, { status: 400 });
  }
  const searchWhere = search ? { OR: [
    { employeeNumber: { contains: search, mode: "insensitive" as const } },
    { firstName: { contains: search, mode: "insensitive" as const } },
    { lastName: { contains: search, mode: "insensitive" as const } },
    { position: { contains: search, mode: "insensitive" as const } },
    { department: { name: { contains: search, mode: "insensitive" as const } } },
  ] } : {};
  const where = { tenantId: session.tenantId, status: "active", loginOnly: false, AND: [employeeLocationScope(scope.locationId), searchWhere] };
  const [employees, total] = await Promise.all([
    prisma.employee.findMany({ where, orderBy: [{ employeeNumber: "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, employeeNumber: true, firstName: true, lastName: true, position: true, salary: true, joiningDate: true, department: { select: { name: true } } } }),
    prisma.employee.count({ where }),
  ]);
  const included = runId ? await prisma.payslip.findMany({
    where: { tenantId: session.tenantId, payrollRunId: runId, employeeId: { in: employees.map((employee) => employee.id) } },
    select: { employeeId: true },
  }) : [];
  const includedIds = new Set(included.map((item) => item.employeeId));
  const monthEnd = payrollPreparationEnd(month);
  return NextResponse.json({ employees: employees.map((employee) => {
    const eligibility = includedIds.has(employee.id) ? "Already in this draft"
      : employee.salary == null || employee.salary <= 0 ? "No current salary"
      : employee.joiningDate && employee.joiningDate >= monthEnd ? "Joins after this month" : "Eligible";
    return { ...employee, eligible: eligibility === "Eligible", eligibility };
  }), page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) });
}
