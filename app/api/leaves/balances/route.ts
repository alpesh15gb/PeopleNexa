import { NextRequest, NextResponse } from "next/server";
import { calculateLeaveBalance, leaveBalanceScope } from "@/lib/leave-balance";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const PAGE_SIZE = 25;

export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager"].includes(session.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const manager = session.role === "location_manager"
    ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } })
    : null;
  const scope = leaveBalanceScope(session.role, manager);
  if (!scope) return NextResponse.json({ error: "no location assigned" }, { status: 403 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const leaveTypeId = request.nextUrl.searchParams.get("leaveTypeId") || null;
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = {
    tenantId: session.tenantId,
    status: "active",
    loginOnly: false,
    ...scope,
    ...(query ? { OR: [
      { firstName: { contains: query, mode: "insensitive" as const } },
      { lastName: { contains: query, mode: "insensitive" as const } },
      { employeeNumber: { contains: query, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [total, employees, types] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, select: { id: true, firstName: true, lastName: true, employeeNumber: true, branch: { select: { name: true, locationId: true } } }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId, ...(leaveTypeId ? { id: leaveTypeId } : {}) }, select: { id: true, name: true, code: true, color: true, maxDays: true }, orderBy: { code: "asc" } }),
  ]);
  const employeeIds = employees.map((employee) => employee.id);
  const now = new Date();
  const [requests, allocations, imports] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, ...(leaveTypeId ? { leaveTypeId } : {}) }, select: { id: true, employeeId: true, leaveTypeId: true, days: true, status: true, fromDate: true, toDate: true, appliedAt: true, leavePolicySnapshot: true }, orderBy: { appliedAt: "desc" } }),
    prisma.leavePolicyBalance.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, ...(leaveTypeId ? { leaveTypeId } : {}), policyPeriod: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } }, include: { policyPeriod: { select: { id: true, locationId: true } } } }),
    prisma.leaveBalanceImportEntry.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, ...(leaveTypeId ? { leaveTypeId } : {}), periodEnd: { lte: now } }, orderBy: { periodEnd: "desc" } }),
  ]);

  const balances = employees.map((employee) => ({
    employee: { ...employee, location: employee.branch?.name ?? null },
    balances: types.map((type) => {
      const allocation = allocations.filter((item) => item.employeeId === employee.id && item.leaveTypeId === type.id).sort((a, b) => Number(b.policyPeriod.locationId === employee.branch?.locationId) - Number(a.policyPeriod.locationId === employee.branch?.locationId))[0];
      const imported = imports.find((item) => item.employeeId === employee.id && item.leaveTypeId === type.id);
      const relevant = requests.filter((item) => item.employeeId === employee.id && item.leaveTypeId === type.id && (allocation ? item.leavePolicySnapshot && typeof item.leavePolicySnapshot === "object" && (item.leavePolicySnapshot as Record<string, unknown>).policyPeriodId === allocation.policyPeriodId : !imported || item.fromDate >= imported.periodEnd));
      const used = relevant.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.days, 0);
      const pending = relevant.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.days, 0);
      const cap = allocation ? allocation.entitlement === null ? null : allocation.entitlement + allocation.carryForward : imported ? 0 : type.maxDays;
      const opening = imported?.openingBalance ?? 0;
      const credited = allocation ? (allocation.entitlement ?? 0) + allocation.carryForward : imported?.credited ?? 0;
      const available = calculateLeaveBalance({ cap, opening: imported ? imported.available : opening, credited: imported ? 0 : credited, used, pending }).available;
      return { leaveType: type, opening, credited, used, pending, available, source: allocation ? "policy period" : imported ? `imported through ${imported.periodEnd.toISOString().slice(0, 7)}` : cap === null ? "unlimited leave type" : "leave type allowance", nextEligibility: allocation?.policySnapshot && typeof allocation.policySnapshot === "object" && (allocation.policySnapshot as Record<string, unknown>).accrual && typeof ((allocation.policySnapshot as Record<string, unknown>).accrual as Record<string, unknown>).availableOn === "string" ? ((allocation.policySnapshot as Record<string, unknown>).accrual as Record<string, unknown>).availableOn : null, history: relevant.slice(0, 5) };
    }),
  }));
  return NextResponse.json({ types, balances, page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
}
