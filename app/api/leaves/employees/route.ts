import { NextRequest, NextResponse } from "next/server";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "branch_manager", "location_manager"].includes(session.role)) {
    return NextResponse.json({ error: "You cannot log leave for other employees." }, { status: 403 });
  }

  let scope: Prisma.EmployeeWhereInput = {};
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) return NextResponse.json({ error: "Your account has no assigned branch." }, { status: 403 });
    scope = { branchId: manager.branchId };
  }
  if (session.role === "location_manager") {
    const locationId = await managerLocationId(session);
    if (!locationId) return NextResponse.json({ error: "Your account has no assigned location." }, { status: 403 });
    scope = employeeLocationScope(locationId);
  }

  const terms = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100).split(/\s+/).filter(Boolean);
  const limit = 30;
  const employees = await prisma.employee.findMany({
    where: {
      tenantId: session.tenantId,
      status: "active",
      loginOnly: false,
      id: { not: session.sub },
      ...scope,
      AND: terms.map((term) => ({ OR: [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { employeeNumber: { contains: term, mode: "insensitive" } },
      ] })),
    },
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    orderBy: [{ employeeNumber: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  return NextResponse.json({ employees: employees.slice(0, limit), hasMore: employees.length > limit });
}
