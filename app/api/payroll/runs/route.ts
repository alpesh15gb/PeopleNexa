import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey } from "@/lib/dates";
import { payrollOperationLocationId } from "@/lib/location-scope";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month");
  if (month && !isMonthKey(month)) return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  const scope = await payrollOperationLocationId(session, req.nextUrl.searchParams.get("locationId"));
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const runs = await prisma.payrollRun.findMany({ where: { tenantId: session.tenantId, ...(month ? { month } : {}), locationId: scope.locationId }, include: { _count: { select: { payslips: true, members: true } } }, orderBy: [{ month: "desc" }, { createdAt: "desc" }] });
  return NextResponse.json({ runs });
}
