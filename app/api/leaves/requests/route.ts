import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, toDateKey, daysBetween } from "@/lib/dates";
import { notifyAdmins, notifyEmployee } from "@/lib/notifications";
import { resolveLeavePolicy } from "@/lib/leave-policy";
import { canApplyLeaveOnBehalf, leaveSubmissionAttribution } from "@/lib/leave-on-behalf";
import { appendAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) {
      return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
    }
    const requests = await prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        employee: { branchId: manager.branchId },
        ...(status ? { status } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        leaveType: true,
      },
      orderBy: { appliedAt: "desc" },
    });
    return NextResponse.json({ requests });
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } });
    if (!manager?.locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
    const requests = await prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employee: { branch: { locationId: manager.locationId } }, ...(status ? { status } : {}) },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } }, leaveType: true },
      orderBy: { appliedAt: "desc" },
    });
    return NextResponse.json({ requests });
  }
  const requests = await prisma.leaveRequest.findMany({
    where: {
      tenantId: session.tenantId,
      ...(session.role !== "admin" ? { employeeId: session.sub } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      leaveType: true,
    },
    orderBy: { appliedAt: "desc" },
  });
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { leaveTypeId, fromDate, toDate, reason } = body as Record<string, string>;
    const halfDay = body.halfDay === true;
    if (!leaveTypeId || !fromDate || !toDate) {
      return NextResponse.json({ error: "Leave type and dates are required." }, { status: 400 });
    }

    const leaveType = await prisma.leaveType.findFirst({
      where: { id: leaveTypeId, tenantId: session.tenantId },
    });
    if (!leaveType) return NextResponse.json({ error: "Leave type not found." }, { status: 404 });

    // Admins may log leave on behalf of an employee; employees apply for themselves.
    let employeeId = session.sub;
    if (body.employeeId && String(body.employeeId) !== session.sub) {
      const target = await prisma.employee.findFirst({
        where: { id: String(body.employeeId), tenantId: session.tenantId },
        select: { id: true, branchId: true, branch: { select: { locationId: true } } },
      });
      if (!target) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
      const actor = await prisma.employee.findFirst({
        where: { id: session.sub, tenantId: session.tenantId },
        select: { branchId: true, locationId: true },
      });
      if (!actor || !canApplyLeaveOnBehalf(session.role, actor, { branchId: target.branchId, locationId: target.branch?.locationId ?? null })) {
        return NextResponse.json({ error: "You are not authorized to apply leave for this employee." }, { status: 403 });
      }
      employeeId = target.id;
    }

    const from = fromDateKey(fromDate);
    const to = fromDateKey(toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Leave dates are invalid. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (to < from) return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
    let days = daysBetween(from, to);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      return NextResponse.json({ error: "Leave duration is invalid." }, { status: 400 });
    }

    // Inactive employees can't accrue new leave.
    const applicant = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId: session.tenantId },
      select: { id: true, status: true, loginOnly: true, branch: { select: { locationId: true } } },
    });
    if (!applicant || applicant.status !== "active") {
      return NextResponse.json({ error: "Only active employees can request leave." }, { status: 403 });
    }
    if (applicant.loginOnly) {
      return NextResponse.json({ error: "Manager logins cannot request leave." }, { status: 403 });
    }
    const attribution = leaveSubmissionAttribution(session.sub, employeeId);

    // Overlap + balance checks and the create run inside one serializable
    // transaction so concurrent submits for the same days cannot both pass.
    let request: Prisma.LeaveRequestGetPayload<{ include: { leaveType: true; employee: { select: { firstName: true; lastName: true } } } }> | undefined;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          request = await prisma.$transaction(async (tx) => {
            const overlap = await tx.leaveRequest.findFirst({
              where: {
                tenantId: session.tenantId,
                employeeId,
                status: { in: ["approved", "pending"] },
                fromDate: { lte: to },
                toDate: { gte: from },
              },
            });
            if (overlap) {
              const err = new Error(
                `This range overlaps an existing ${overlap.status} request (${toDateKey(overlap.fromDate)} → ${toDateKey(overlap.toDate)}).`
              ) as Error & { code?: string };
              err.code = "OVERLAP";
              throw err;
            }

              const usedRows = await tx.leaveRequest.findMany({
              where: {
                tenantId: session.tenantId,
                employeeId,
                leaveTypeId,
                status: { in: ["approved", "pending"] },
              },
                select: { days: true, leavePolicySnapshot: true },
              });
            // Policy selection is part of the same transaction as the request
            // creation so this exact active/effective version is snapshotted.
            const policyRecords = await tx.configurationRecord.findMany({
              where: { tenantId: session.tenantId, kind: "leave_policy", active: true },
              select: { id: true, locationId: true, version: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true },
            });
            const resolvedPolicy = resolveLeavePolicy(policyRecords, applicant.branch?.locationId ?? null, from, leaveType.code);
            const allocated = resolvedPolicy ? await tx.leavePolicyBalance.findFirst({ where: { tenantId: session.tenantId, employeeId, leaveTypeId, policyPeriod: { configurationId: resolvedPolicy.configurationId, effectiveFrom: { lte: from }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] } }, include: { policyPeriod: { select: { id: true } } } }) : null;
            // Activated policies retain legacy behavior until this employee has
            // an explicit policy-period allocation.
            const policy = allocated ? resolvedPolicy : null;
            const allocationSnapshot = allocated?.policySnapshot && typeof allocated.policySnapshot === "object" ? allocated.policySnapshot as Record<string, unknown> : null;
            const accrual = allocationSnapshot?.accrual && typeof allocationSnapshot.accrual === "object" ? allocationSnapshot.accrual as Record<string, unknown> : null;
            const availableOn = typeof accrual?.availableOn === "string" ? new Date(accrual.availableOn) : null;
            if (availableOn && from < availableOn) {
              const err = new Error(`This earned leave is available from ${availableOn.toISOString().slice(0, 10)}. The joining-month claim deferral is recorded with this policy-period allocation.`) as Error & { code?: string };
              err.code = "NOT_AVAILABLE";
              throw err;
            }
            if (halfDay && (!policy || !policy.rules.allowsHalfDay)) {
              const err = new Error(policy ? "Half-day leave is not allowed for this leave type." : "Half-day leave requires an active leave policy that allows it.") as Error & { code?: string };
              err.code = "HALF_DAY";
              throw err;
            }
            if (halfDay && from.getTime() !== to.getTime()) {
              const err = new Error("Half-day leave must be for a single date.") as Error & { code?: string };
              err.code = "HALF_DAY";
              throw err;
            }
            if (halfDay) days = 0.5;
            const usedDays = allocated ? usedRows.filter((row) => row.leavePolicySnapshot && typeof row.leavePolicySnapshot === "object" && (row.leavePolicySnapshot as Record<string, unknown>).policyPeriodId === allocated.policyPeriod.id).reduce((sum, row) => sum + row.days, 0) : usedRows.reduce((sum, row) => sum + row.days, 0);
            const entitlement = allocated ? allocated.entitlement + allocated.carryForward : leaveType.maxDays;
            if (usedDays + days > entitlement) {
              const err = new Error(
                `Insufficient balance — ${entitlement - usedDays} day(s) remaining.`
              ) as Error & { code?: string };
              err.code = "BALANCE";
              throw err;
            }

            return tx.leaveRequest.create({
              data: {
                tenantId: session.tenantId,
                employeeId,
                leaveTypeId,
                fromDate: from,
                toDate: to,
                days,
                reason: reason || null,
                status: (policy?.rules.requiresApproval ?? leaveType.requiresApproval) ? "pending" : "approved",
                createdBy: attribution.createdBy,
                source: attribution.source,
                leavePolicySnapshot: policy && allocated ? { ...policy, policyPeriodId: allocated.policyPeriod.id, ...(accrual ? { accrual } : {}) } as Prisma.InputJsonValue : undefined,
              },
              include: { leaveType: true, employee: { select: { firstName: true, lastName: true } } },
            });
          }, { isolationLevel: "Serializable" });
          break;
        } catch (e) {
          const code = (e as { code?: string })?.code;
          if (code !== "P2034" || attempt === 2) throw e;
        }
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "OVERLAP" || code === "BALANCE" || code === "HALF_DAY" || code === "NOT_AVAILABLE") {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
      }
      if (code === "P2002" || code === "P2034") {
        return NextResponse.json({ error: "Leave request conflicted with another submission. Please try again." }, { status: 409 });
      }
      throw e;
    }
    if (!request) {
      return NextResponse.json({ error: "Leave request conflicted with another submission. Please try again." }, { status: 409 });
    }

    await appendAudit({
      tenantId: session.tenantId,
      actorId: session.sub,
      actorRole: session.role,
      action: attribution.onBehalf ? "leave.create_on_behalf" : "leave.create",
      entity: "LeaveRequest",
      entityId: request.id,
      summary: `${attribution.onBehalf ? "recorded for employee" : "submitted"} ${request.days}d ${request.leaveType.name}`,
      after: { employeeId, createdBy: attribution.createdBy, source: attribution.source, status: request.status },
    });

    // Notify admins about the new request (or the employee when auto-approved).
    if (attribution.onBehalf) {
      await notifyEmployee(
        session.tenantId,
        employeeId,
        "info",
        "Leave logged for you",
        `${request.leaveType.name} (${toDateKey(request.fromDate)} → ${toDateKey(request.toDate)}) was logged on your behalf by an admin.`
      );
      if (request.status === "pending") {
        await notifyAdmins(
          session.tenantId,
          "info",
          "Leave request recorded for employee",
          `${request.employee.firstName} ${request.employee.lastName}'s ${days} day(s) of ${request.leaveType.name} needs approval.`
        );
      }
    } else if (request.status === "pending") {
      await notifyAdmins(
        session.tenantId,
        "info",
        "New leave request",
        `${request.employee.firstName} ${request.employee.lastName} requested ${days} day(s) of ${request.leaveType.name}.`
      );
    } else {
      await notifyEmployee(
        session.tenantId,
        employeeId,
        "success",
        "Leave approved",
        `Your ${request.leaveType.name} (${toDateKey(request.fromDate)} → ${toDateKey(request.toDate)}) was auto-approved.`
      );
    }

    return NextResponse.json({ request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create leave request." }, { status: 500 });
  }
}
