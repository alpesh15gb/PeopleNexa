import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { encashableLeaveAt } from "@/lib/leave-encashment";
import { computeFandF } from "@/lib/exit";
import { notifyAdmins, notifyEmployee } from "@/lib/notifications";
import { dayRangeIST, formatDateIST } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import { sendWhatsApp } from "@/lib/whatsapp";
import { appendAudit } from "@/lib/audit";
import { enforceEbioEmployeeAccess } from "@/lib/ebioserver";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { formatRegionalMoney, workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";

/** PATCH — { action: "approve" | "reject" | "complete" | "cancel", note? } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note.trim() || null : null;
  if (note && note.length > 2000) return NextResponse.json({ error: "Notes must be 2,000 characters or fewer." }, { status: 400 });
  if (action !== "approve" && action !== "reject" && action !== "complete" && action !== "cancel") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const locationId = await managerLocationId(session);
  const canReview = session.role === "admin" || !!locationId;
  if (action !== "cancel" && !canReview) return NextResponse.json({ error: "You cannot review exit requests." }, { status: 403 });

  const scope = session.role === "admin" ? {} : locationId
    ? action === "cancel"
      ? { OR: [{ employeeId: session.sub }, { employee: employeeLocationScope(locationId) }] }
      : { employee: employeeLocationScope(locationId) }
    : { employeeId: session.sub };
  const where = { id, tenantId: session.tenantId, ...scope };

  const request = await prisma.exitRequest.findFirst({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  });
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const isOwnRequest = request.employeeId === session.sub;
  if (isOwnRequest && action !== "cancel") return NextResponse.json({ error: "A different administrator must review and complete your exit request." }, { status: 403 });
  const conflict = () => NextResponse.json({ error: "This exit request changed. Refresh to view its current status." }, { status: 409 });

  try {
    if ((action === "complete" && request.status === "completed") || (action === "cancel" && request.status === "cancelled")) {
      const { employee: _employee, ...resolved } = request;
      return NextResponse.json({ request: resolved });
    }
    if (action === "approve") {
      // Prevent F&F overwrite: repeat approve is idempotent — return existing settlement.
      if (request.status === "approved") {
        const { employee: _employee, ...approved } = request;
        return NextResponse.json({ request: approved, fAndF: request.fAndF });
      }
      if (request.status !== "pending") {
        return NextResponse.json({ error: "Only pending requests can be approved." }, { status: 400 });
      }
      // Compute full & final settlement.
      // salary already includes basic+HRA+allowances — pass it through as-is.
      const { claimed, fAndF, region } = await prisma.$transaction(async (tx) => {
        const [employee, loans, tenant] = await Promise.all([
          tx.employee.findFirstOrThrow({ where: { id: request.employeeId, tenantId: session.tenantId }, select: { salary: true } }),
          tx.employeeLoan.aggregate({ where: { tenantId: session.tenantId, employeeId: request.employeeId, status: "active" }, _sum: { outstanding: true } }),
          tx.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } }),
        ]);
        const rawNoticeDays = (tenant.config as { exitNoticeDays?: unknown } | null)?.exitNoticeDays;
        const noticeDays = typeof rawNoticeDays === "number" && Number.isFinite(rawNoticeDays) && rawNoticeDays >= 0 ? Math.floor(rawNoticeDays) : 30;
        const encashment = await encashableLeaveAt(tx, session.tenantId, request.employeeId, request.lastWorkingDay);

        const fAndF = computeFandF({
          grossMonthly: Math.max(0, Math.round(employee.salary ?? 0)),
          resignationDate: request.resignationDate,
          lastWorkingDay: request.lastWorkingDay,
          noticeDays,
          loanOutstanding: loans._sum.outstanding ?? 0,
          encashmentDays: encashment.days,
        });

        const settlementSnapshot = { ...fAndF, encashmentLedger: encashment.ledger, encashmentAsOf: request.lastWorkingDay.toISOString() };
        const claimed = await tx.exitRequest.updateMany({
          where: { ...where, status: "pending" },
          data: { status: "approved", note, reviewedBy: session.sub, reviewedAt: new Date(), fAndF: JSON.parse(JSON.stringify(settlementSnapshot)) },
        });
        if (claimed.count) await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "exit.approve", entity: "ExitRequest", entityId: id, summary: "Approved exit with period-scoped leave encashment", before: { status: "pending" }, after: JSON.parse(JSON.stringify(settlementSnapshot)) } });
        return { claimed, fAndF, region: workspaceRegion(tenant.config) };
      }, { isolationLevel: "Serializable" });
      if (claimed.count === 0) {
        const latest = await prisma.exitRequest.findFirst({
          where,
        });
        if (latest?.status === "approved") return NextResponse.json({ request: latest, fAndF: latest.fAndF });
        return conflict();
      }
      const updated = await prisma.exitRequest.findFirstOrThrow({
        where: { id, tenantId: session.tenantId },
        include: { employee: { select: { firstName: true, lastName: true } } },
      });

      await notifyEmployee(
        session.tenantId,
        request.employeeId,
        "success",
        "Resignation approved",
        `Your last working day is ${formatDateIST(request.lastWorkingDay)}. Final settlement ${formatRegionalMoney(fAndF.finalAmount, region)}.`
      ).catch((error) => console.warn("Failed to notify employee about exit approval", error));
      await sendWhatsApp(session.tenantId, request.employee.phone ?? null, "exit.approved", {
        lwd: formatDateIST(request.lastWorkingDay),
        amount: fAndF.finalAmount.toFixed(0),
      }).catch((error) => console.warn("Failed to send exit approval message", error));
      return NextResponse.json({ request: updated, fAndF });
    }

    if (action === "reject") {
      if (request.status !== "pending") {
        return NextResponse.json({ error: "Only pending requests can be rejected." }, { status: 400 });
      }
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.exitRequest.updateMany({ where: { ...where, status: "pending" }, data: { status: "rejected", note, reviewedBy: session.sub, reviewedAt: new Date() } });
        if (!claimed.count) return null;
        await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "exit.reject", entity: "ExitRequest", entityId: id, summary: "Exit request rejected", before: { status: "pending" }, after: { status: "rejected", note } } });
        return tx.exitRequest.findUniqueOrThrow({ where: { id } });
      });
      if (!updated) return conflict();
      await notifyEmployee(
        session.tenantId,
        request.employeeId,
        "info",
        "Resignation not accepted",
        note ? `Note from HR: ${note}` : "Your exit request was not approved. Contact HR."
      ).catch((error) => console.warn("Failed to notify employee about exit rejection", error));
      return NextResponse.json({ request: updated });
    }

    if (action === "complete") {
      if (request.status !== "approved") {
        return NextResponse.json({ error: "Only approved requests can be completed." }, { status: 400 });
      }
      const now = new Date();
      const lastWorkingDay = istDateKey(request.lastWorkingDay);
      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } });
        if (dateKeyInTimeZone(now, workspaceRegion(tenant.config).timeZone) < lastWorkingDay) {
          return { error: `Complete the exit on or after the last working day, ${formatDateIST(request.lastWorkingDay)}.`, status: 400 };
        }
        const employee = await tx.employee.findFirstOrThrow({ where: { id: request.employeeId, tenantId: session.tenantId }, select: { role: true, status: true } });
        if (locationId && ["admin", "branch_manager", "location_manager"].includes(employee.role)) return { error: "An administrator must offboard privileged accounts.", status: 403 };
        if (employee.role === "admin" && employee.status === "active") {
          const activeAdmins = await tx.employee.count({ where: { tenantId: session.tenantId, role: "admin", status: "active" } });
          if (activeAdmins <= 1) return { error: "Assign another active administrator before completing this exit.", status: 400 };
        }
        const claimed = await tx.exitRequest.updateMany({
          where: { ...where, status: "approved" },
          data: { status: "completed", note: note ?? request.note, reviewedBy: session.sub, reviewedAt: now },
        });
        if (!claimed.count) return { error: "This exit request changed. Refresh to view its current status.", status: 409 };

        await tx.employee.update({ where: { id: request.employeeId, tenantId: session.tenantId }, data: { status: "inactive", sessionVersion: { increment: 1 } } });
        const assignments = await tx.assetAssignment.findMany({ where: { employeeId: request.employeeId, returnedAt: null, asset: { tenantId: session.tenantId } }, select: { id: true, assetId: true } });
        if (assignments.length) {
          await tx.assetAssignment.updateMany({ where: { id: { in: assignments.map((assignment) => assignment.id) } }, data: { returnedAt: now } });
          await tx.asset.updateMany({ where: { id: { in: assignments.map((assignment) => assignment.assetId) }, tenantId: session.tenantId, status: "assigned", assignments: { none: { returnedAt: null } } }, data: { status: "available" } });
        }
        await tx.rosterAssignment.deleteMany({ where: { tenantId: session.tenantId, employeeId: request.employeeId, date: { gte: dayRangeIST(lastWorkingDay).end } } });
        const transfers = await tx.employeeTransfer.updateMany({ where: { tenantId: session.tenantId, employeeId: request.employeeId, status: "scheduled" }, data: { status: "cancelled", cancelledBy: session.sub, cancelledAt: now } });
        await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "exit.complete", entity: "ExitRequest", entityId: id, summary: "Completed exit and deactivated employee", before: { status: "approved" }, after: { status: "completed", employeeId: request.employeeId, returnedAssets: assignments.length, cancelledTransfers: transfers.count } } });
        return { request: await tx.exitRequest.findUniqueOrThrow({ where: { id } }) };
      }, { isolationLevel: "Serializable" });
      if (!result.request) return NextResponse.json({ error: result.error }, { status: result.status });

      const deviceResults = await enforceEbioEmployeeAccess(session.tenantId, request.employeeId, false).catch((error) => {
        console.warn("Failed to submit device block after exit completion", error);
        return null;
      });
      const deviceFailures = deviceResults?.filter((result) => result.status === "failed") ?? [];
      if (deviceResults?.length || deviceResults === null) await appendAudit({
        tenantId: session.tenantId,
        actorId: session.sub,
        actorRole: session.role,
        action: "exit.device_access.block",
        entity: "Employee",
        entityId: request.employeeId,
        summary: deviceResults ? `Submitted ${deviceResults.length} device block(s), ${deviceFailures.length} failed` : "Could not submit device blocks",
        after: { allowed: false, results: deviceResults },
      });
      await notifyAdmins(
        session.tenantId,
        "info",
        "Employee offboarded",
        `${request.employee.firstName} ${request.employee.lastName} is now marked inactive.`
      ).catch((error) => console.warn("Failed to notify admins about exit completion", error));
      const deviceWarning = deviceResults === null || deviceFailures.length > 0 ? "Review Device access in Employee Master. Retry recorded failed or pending block commands there." : null;
      return NextResponse.json({ request: result.request, deviceWarning });
    }

    if (request.status !== "pending" && (isOwnRequest || request.status !== "approved")) {
      return NextResponse.json({ error: isOwnRequest && request.status === "approved" ? "Contact HR to withdraw an approved exit request." : "Only open exit requests can be cancelled." }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.exitRequest.updateMany({ where: { ...where, status: request.status }, data: { status: "cancelled", note: note ?? request.note } });
      if (!claimed.count) return null;
      await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "exit.cancel", entity: "ExitRequest", entityId: id, summary: "Exit request cancelled", before: { status: request.status }, after: { status: "cancelled", note } } });
      return tx.exitRequest.findUniqueOrThrow({ where: { id } });
    });
    if (!updated) return conflict();
    await notifyAdmins(
      session.tenantId,
      "info",
      "Exit request cancelled",
      `The exit request for ${request.employee.firstName} ${request.employee.lastName} was cancelled.`
    ).catch((error) => console.warn("Failed to notify admins about exit cancellation", error));
    return NextResponse.json({ request: updated });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") return conflict();
    throw error;
  }
}
