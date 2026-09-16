import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, isDateKey } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "branch_manager", "location_manager"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? from;
  if (!isDateKey(from) || !isDateKey(to)) return NextResponse.json({ error: "Valid from and to dates are required." }, { status: 400 });
  const { start } = dayRangeIST(from); const { end } = dayRangeIST(to);
  const search = params.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1)); const size = Math.min(500, Math.max(10, Number(params.get("size") ?? 50)));
  const manager = session.role !== "admin" ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true, locationId: true } }) : null;
  const employeeScope = session.role === "branch_manager" ? { branchId: manager?.branchId ?? "__none__" } : session.role === "location_manager" ? { branch: { locationId: manager?.locationId ?? "__none__" } } : {};
  const where = { tenantId: session.tenantId, punchTime: { gte: start, lt: end }, employee: { ...employeeScope, ...(search ? { OR: [{ firstName: { contains: search, mode: "insensitive" as const } }, { lastName: { contains: search, mode: "insensitive" as const } }, { employeeNumber: { contains: search, mode: "insensitive" as const } }] } : {}) } };
  const [total, punches] = await Promise.all([prisma.punch.count({ where }), prisma.punch.findMany({ where, select: { id: true, punchTime: true, inOutHint: true, employee: { select: { employeeNumber: true, deviceCode: true, firstName: true, lastName: true, branch: { select: { name: true } }, department: { select: { name: true } } } }, device: { select: { name: true, serialNumber: true } } }, orderBy: { punchTime: "desc" }, skip: (page - 1) * size, take: size })]);
  return NextResponse.json({ total, page, size, punches });
}
