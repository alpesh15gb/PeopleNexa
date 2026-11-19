import { NextRequest, NextResponse } from "next/server";
import { payrollOperationLocationId } from "@/lib/location-scope";
import { payrollSourceReview } from "@/lib/payroll-source-review";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "Only payroll reviewers can check this run." }, { status: 403 });
  }
  const scope = await payrollOperationLocationId(session, request.nextUrl.searchParams.get("locationId"));
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const { id } = await params;
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findFirst({
      where: { id, tenantId: session.tenantId, locationId: scope.locationId },
      select: {
        month: true, status: true,
        payslips: {
          select: {
            employeeId: true, inputSnapshot: true,
            employee: { select: { id: true, shiftId: true, joiningDate: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!run) return NextResponse.json({ error: "Payroll run not found for this location." }, { status: 404 });
    if (!["draft", "reviewed", "approved"].includes(run.status)) {
      return NextResponse.json({ error: "View the recorded payslips for finalized or closed payroll." }, { status: 409 });
    }
    const issues = run.payslips.length
      ? await payrollSourceReview(tx, session.tenantId, run.month, run.payslips)
      : ["Generate at least one payslip before reviewing this run."];
    return NextResponse.json({ issues, checkedEmployees: run.payslips.length }, { headers: { "Cache-Control": "private, no-store" } });
  }, { isolationLevel: "RepeatableRead", timeout: 20000 });
}
