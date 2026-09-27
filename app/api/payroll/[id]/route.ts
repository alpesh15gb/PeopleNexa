import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  await req.json().catch(() => ({}));

  const payslip = await prisma.payslip.findFirst({
    where: { id, tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) },
  });
  if (!payslip) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Payment and lifecycle state are always owned by a run. Legacy documents are read-only.
  return NextResponse.json({ error: payslip.payrollRunId ? "Run-controlled payslips cannot be paid or edited individually. Use the payroll run lifecycle." : "Legacy payslips are read-only documents and cannot be changed or paid individually." }, { status: 409 });
}
