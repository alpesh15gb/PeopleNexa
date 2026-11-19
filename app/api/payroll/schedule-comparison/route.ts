import { NextRequest, NextResponse } from "next/server";
import { isMonthKey } from "@/lib/dates";
import { employeeLocationScope } from "@/lib/location-scope";
import { comparePayrollAttendanceSchedules, monthRange } from "@/lib/payroll";
import { resolvePayrollPolicy } from "@/lib/payroll-policy";
import { payrollScheduleTotals, totalPayrollSchedule, type PayrollScheduleComparison } from "@/lib/payroll-schedule-comparison";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { supportsIndiaPayroll, workspaceRegion } from "@/lib/workspace-region";

const BATCH_SIZE = 4;

export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const month = request.nextUrl.searchParams.get("month") ?? "";
  const locationId = request.nextUrl.searchParams.get("locationId") ?? "";
  if (!isMonthKey(month)) return NextResponse.json({ error: "Select a valid payroll month." }, { status: 400 });
  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: session.tenantId, isActive: true }, select: { id: true } });
  if (!location) return NextResponse.json({ error: "Select an active location in this workspace." }, { status: 400 });

  const { end } = monthRange(month);
  const tenantId = session.tenantId;
  const [tenant, policies, employees] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { config: true } }),
    prisma.configurationRecord.findMany({
      where: { tenantId, kind: "payroll_policy", active: true, OR: [{ locationId }, { locationId: null }] },
      select: { id: true, locationId: true, version: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true },
    }),
    prisma.employee.findMany({
      where: {
        tenantId, status: "active", loginOnly: false, salary: { gt: 0 },
        AND: [employeeLocationScope(locationId), { OR: [{ joiningDate: null }, { joiningDate: { lt: end } }] }],
      },
      select: { id: true, employeeNumber: true, firstName: true, lastName: true, shiftId: true, joiningDate: true },
      orderBy: [{ employeeNumber: "asc" }, { id: "asc" }],
    }),
  ]);
  if (!supportsIndiaPayroll(workspaceRegion(tenant.config))) {
    return NextResponse.json({ error: "Built-in payroll comparison requires an India workspace with INR currency." }, { status: 409 });
  }

  const compared: PayrollScheduleComparison["affected"] = [];
  const needsReview: PayrollScheduleComparison["needsReview"] = [];
  for (let index = 0; index < employees.length; index += BATCH_SIZE) {
    const results = await Promise.all(employees.slice(index, index + BATCH_SIZE).map(async (employee) => {
      const identity = { employeeNumber: employee.employeeNumber, employeeName: `${employee.firstName} ${employee.lastName}`.trim() };
      try {
        const { legacy, scheduled } = await comparePayrollAttendanceSchedules(tenantId, employee, month);
        return { row: { ...identity, legacy: payrollScheduleTotals(legacy), shiftBased: payrollScheduleTotals(scheduled) } };
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message.startsWith("Payroll blocked for employee")) {
          return { issue: { ...identity, reason: "Resolve attendance requiring review before comparing." } };
        }
        if (error.message.startsWith("Leave snapshot has no valid day fraction")) {
          return { issue: { ...identity, reason: "Review the approved leave calendar before comparing." } };
        }
        throw error;
      }
    }));
    for (const result of results) {
      if (result.row) compared.push(result.row);
      else if (result.issue) needsReview.push(result.issue);
    }
  }

  const comparison: PayrollScheduleComparison = {
    month,
    compared: compared.length,
    affected: compared.filter(({ legacy, shiftBased }) => legacy.workingDays !== shiftBased.workingDays || legacy.absentDays !== shiftBased.absentDays || legacy.unpaidDays !== shiftBased.unpaidDays),
    legacy: totalPayrollSchedule(compared.map((row) => row.legacy)),
    shiftBased: totalPayrollSchedule(compared.map((row) => row.shiftBased)),
    needsReview,
    liveUsesShiftWeeklyOffs: resolvePayrollPolicy(policies, tenant.config, locationId, month).appliedRules.useShiftWeeklyOffs,
  };
  return NextResponse.json(comparison, { headers: { "Cache-Control": "private, no-store" } });
}
