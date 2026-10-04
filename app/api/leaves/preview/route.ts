import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, daysBetween } from "@/lib/dates";
import { configurationEffectiveAtISTDay } from "@/lib/configuration";
import { resolveLeavePolicy } from "@/lib/leave-policy";
import { leaveCalendar } from "@/lib/leave-calendar";

/** Read-only estimate; submission revalidates policy, eligibility and balance atomically. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const fromKey = req.nextUrl.searchParams.get("from") ?? "";
  const toKey = req.nextUrl.searchParams.get("to") ?? "";
  const typeId = req.nextUrl.searchParams.get("type") ?? "";
  const halfDay = req.nextUrl.searchParams.get("halfDay") === "true";
  const from = fromDateKey(fromKey), to = fromDateKey(toKey);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from || daysBetween(from, to) > 365) return NextResponse.json({ error: "Choose a valid date range of at most 365 days." }, { status: 400 });
  const [employee, type, records, holidays] = await Promise.all([
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true, branch: { select: { locationId: true } } } }),
    prisma.leaveType.findFirst({ where: { id: typeId, tenantId: session.tenantId } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "leave_policy", active: true } }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId }, select: { date: true, isRecurring: true, isHalfDay: true } }),
  ]);
  if (!employee || !type) return NextResponse.json({ error: "Leave type or employee not found." }, { status: 404 });
  const at = configurationEffectiveAtISTDay(from);
  const resolved = resolveLeavePolicy(records, employee.branch?.locationId ?? employee.locationId, at, type.code);
  const allocated = resolved ? await prisma.leavePolicyBalance.findFirst({ where: { tenantId: session.tenantId, employeeId: session.sub, leaveTypeId: typeId, policyPeriod: { configurationId: resolved.configurationId, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] } } }) : null;
  const rules = allocated ? resolved?.rules : undefined;
  if (halfDay && (fromKey !== toKey || !rules?.allowsHalfDay)) return NextResponse.json({ error: "Half-day leave requires a single date and a policy allowing it." }, { status: 400 });
  const calendar = rules?.dayCounting ? leaveCalendar(fromKey, toKey, rules, holidays, halfDay) : null;
  return NextResponse.json({ days: calendar?.days ?? (halfDay ? 0.5 : daysBetween(from, to)), chargeableDays: calendar?.chargeableDays ?? null, requiresReason: rules?.requiresReason ?? false, dayCounting: rules?.dayCounting ?? "legacy", estimate: true });
}
