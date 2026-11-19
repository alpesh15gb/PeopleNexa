import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/dates";
import { configurationEffectiveAtISTDay } from "@/lib/configuration";
import { resolveLeavePolicy } from "@/lib/leave-policy";
import { leaveCalendar, leaveEligibilityError, parseLeaveDateKey } from "@/lib/leave-calendar";
import { workspaceRegion } from "@/lib/workspace-region";

/** Read-only estimate; submission revalidates policy, eligibility and balance atomically. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const fromKey = req.nextUrl.searchParams.get("from") ?? "";
  const toKey = req.nextUrl.searchParams.get("to") ?? "";
  const typeId = req.nextUrl.searchParams.get("type") ?? "";
  const halfDay = req.nextUrl.searchParams.get("halfDay") === "true";
  const from = parseLeaveDateKey(fromKey), to = parseLeaveDateKey(toKey);
  if (!from || !to || to < from || daysBetween(from, to) > 365) return NextResponse.json({ error: "Choose a valid date range of at most 365 days." }, { status: 400 });
  const [employee, type, records, holidays] = await Promise.all([
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { status: true, loginOnly: true, joiningDate: true, locationId: true, branch: { select: { locationId: true } }, tenant: { select: { config: true } } } }),
    prisma.leaveType.findFirst({ where: { id: typeId, tenantId: session.tenantId } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "leave_policy", active: true } }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId }, select: { date: true, isRecurring: true, isHalfDay: true } }),
  ]);
  if (!employee || !type) return NextResponse.json({ error: "Leave type or employee not found." }, { status: 404 });
  if (employee.status !== "active" || employee.loginOnly) return NextResponse.json({ error: "Only active employees can request leave." }, { status: 403 });
  const at = configurationEffectiveAtISTDay(from);
  const resolved = resolveLeavePolicy(records, employee.branch?.locationId ?? employee.locationId, at, type.code);
  const allocated = resolved ? await prisma.leavePolicyBalance.findFirst({ where: { tenantId: session.tenantId, employeeId: session.sub, leaveTypeId: typeId, policyPeriod: { configurationId: resolved.configurationId, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] } }, include: { policyPeriod: { select: { effectiveTo: true } } } }) : null;
  if (allocated?.policyPeriod.effectiveTo && configurationEffectiveAtISTDay(to) > allocated.policyPeriod.effectiveTo) {
    return NextResponse.json({ error: "Split leave across policy periods into separate requests." }, { status: 400 });
  }
  const rules = allocated ? resolved?.rules : undefined;
  if (halfDay && (fromKey !== toKey || !rules?.allowsHalfDay)) return NextResponse.json({ error: "Half-day leave requires a single date and a policy allowing it." }, { status: 400 });
  const calendar = rules?.dayCounting ? leaveCalendar(fromKey, toKey, rules, holidays, halfDay) : null;
  const days = calendar?.days ?? (halfDay ? 0.5 : daysBetween(from, to));
  if (days <= 0) return NextResponse.json({ error: "These dates contain no chargeable leave days. Choose working dates." }, { status: 400 });
  const dateError = leaveEligibilityError({ ...rules, requiresReason: false }, fromKey, days, employee.joiningDate, "", new Date(), workspaceRegion(employee.tenant.config).timeZone);
  if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });
  return NextResponse.json({
    days,
    chargeableDays: calendar?.chargeableDays ?? null,
    requiresReason: rules?.requiresReason ?? false,
    requiresApproval: rules?.requiresApproval ?? type.requiresApproval,
    dayCounting: rules?.dayCounting ?? "legacy",
    estimate: true,
  });
}
