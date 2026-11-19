import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { notifyEmployee } from "@/lib/notifications";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { EXPENSE_REIMBURSEMENT_PREFIX, hasPaidExpenseReimbursement } from "@/lib/expense-reimbursement";
import { supportsIndiaPayroll, workspaceRegion } from "@/lib/workspace-region";

const FLOW = ["approved", "rejected", "settled"] as const;

/** PATCH — admin approves / rejects / settles a claim. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const status = FLOW.find((value) => value === body?.status);
  if (!status) {
    return NextResponse.json({ error: "status must be approved, rejected or settled." }, { status: 400 });
  }

  const where = {
    id,
    tenantId: session.tenantId,
    ...(locationId ? { employee: employeeLocationScope(locationId) } : {}),
  };
  const note = body.reviewNote ? String(body.reviewNote).trim() : null;
  if (note && note.length > 2000) return NextResponse.json({ error: "Use a note of 2,000 characters or fewer." }, { status: 400 });
  const payrollMonth = body.payrollMonth ?? monthKeyIST();
  if (status === "approved" && (typeof payrollMonth !== "string" || !isMonthKey(payrollMonth))) {
    return NextResponse.json({ error: "Select a valid payroll month for this reimbursement." }, { status: 400 });
  }
  const result = await prisma.$transaction(async (tx) => {
    // Another review can advance the row by at most two states. Reload after
    // a lost update so retries see the committed transition and its effects.
    for (let attempt = 0; attempt < 3; attempt++) {
      const claim = await tx.expenseClaim.findFirst({ where });
      if (!claim) return { outcome: "missing" } as const;
      if (claim.employeeId === session.sub) return { outcome: "denied", message: "An independent reviewer must review this claim." } as const;
      if (claim.status === status) return { outcome: "unchanged", claim } as const;
      if (claim.status !== "pending" && !(claim.status === "approved" && status === "settled")) {
        return { outcome: "conflict", status: claim.status } as const;
      }
      if (status === "settled" && claim.status === "pending" && (!note || body.settlementMethod !== "external")) {
        return { outcome: "invalid", message: "Confirm payment outside payroll and enter its payment reference." } as const;
      }
      if (status === "settled" && claim.status === "approved" && !(await hasPaidExpenseReimbursement(tx, claim))) {
        return { outcome: "blocked", message: "This reimbursement must appear in a paid payroll before it can be marked settled." } as const;
      }
      if (status === "approved") {
        const [tenant, employee] = await Promise.all([
          tx.tenant.findUniqueOrThrow({ where: { id: claim.tenantId }, select: { config: true } }),
          tx.employee.findFirst({ where: { id: claim.employeeId, tenantId: claim.tenantId }, select: { salary: true, status: true, loginOnly: true, branchId: true, locationId: true, branch: { select: { locationId: true } } } }),
        ]);
        if (!supportsIndiaPayroll(workspaceRegion(tenant.config))) return { outcome: "blocked", message: "This workspace uses external expense settlement." } as const;
        const payrollLocationId = employee?.branchId ? employee.branch?.locationId : employee?.locationId;
        if (!payrollLocationId || !employee?.salary || employee.salary <= 0 || employee.status !== "active" || employee.loginOnly) {
          return { outcome: "blocked", message: "This employee needs an active payroll assignment and salary. Use external settlement if the claim was paid separately." } as const;
        }
        if (!(await tx.location.findFirst({ where: { id: payrollLocationId, tenantId: claim.tenantId, isActive: true }, select: { id: true } }))) {
          return { outcome: "blocked", message: "The employee’s payroll location must be active before approving a reimbursement." } as const;
        }
        const payrollScope = { tenantId: claim.tenantId, month: payrollMonth, OR: [{ locationId: payrollLocationId }, { payslips: { some: { employeeId: claim.employeeId } } }, { members: { some: { employeeId: claim.employeeId } } }] };
        await tx.payrollRun.updateMany({ where: { ...payrollScope, status: "draft" }, data: { status: "draft" } });
        const locked = await tx.payrollRun.findFirst({ where: { ...payrollScope, status: { in: ["reviewed", "approved", "finalized", "paid"] } }, select: { status: true } });
        if (locked) return { outcome: "blocked", message: `Payroll for ${payrollMonth} is ${locked.status}. Choose an open payroll month or confirm external payment.` } as const;
      }

      const reviewedAt = new Date();
      const [updated] = await tx.expenseClaim.updateManyAndReturn({
        where: { ...where, status: claim.status },
        data: {
          status,
          reviewNote: note,
          reviewedBy: session.sub,
          reviewedAt,
          ...(status === "settled" ? { settledAt: reviewedAt } : {}),
        },
      });
      if (!updated) continue;

      // Only payroll approval posts a reimbursement. A separately paid claim
      // records settlement evidence without creating a second payment item.
      if (status === "approved") {
        await tx.payrollAdjustment.create({
          data: {
            tenantId: claim.tenantId,
            employeeId: claim.employeeId,
            month: payrollMonth,
            type: "other",
            label: EXPENSE_REIMBURSEMENT_PREFIX + claim.id,
            amount: claim.amount,
            note: claim.title,
            createdBy: session.sub,
          },
        });
      }
      await tx.auditLog.create({ data: {
        tenantId: claim.tenantId, actorId: session.sub, actorRole: session.role,
        action: `expense.${status}`, entity: "ExpenseClaim", entityId: claim.id,
        summary: status === "settled" && claim.status === "pending" ? "Recorded payment outside payroll" : `Expense claim ${status}`,
        before: { status: claim.status }, after: { status, note, ...(status === "approved" ? { payrollMonth } : {}) },
      } });
      return { outcome: "changed", claim: updated } as const;
    }
    return { outcome: "retry" } as const;
  }, { isolationLevel: "Serializable" }).catch((error: unknown) => {
    if ((error as { code?: string })?.code === "P2034") return { outcome: "retry" } as const;
    throw error;
  });

  if (result.outcome === "missing") return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  if (result.outcome === "conflict") return NextResponse.json({ error: `A ${result.status} claim cannot be marked ${status}.` }, { status: 409 });
  if (result.outcome === "retry") return NextResponse.json({ error: "The claim changed during review. Refresh and try again." }, { status: 409 });
  if (result.outcome === "invalid") return NextResponse.json({ error: result.message }, { status: 400 });
  if (result.outcome === "denied") return NextResponse.json({ error: result.message }, { status: 403 });
  if (result.outcome === "blocked") return NextResponse.json({ error: result.message }, { status: 409 });
  if (result.outcome === "unchanged") return NextResponse.json({ claim: result.claim });

  const { claim } = result;
  await notifyEmployee(
    claim.tenantId,
    claim.employeeId,
    status === "rejected" ? "danger" : "success",
    `Expense claim ${status}`,
    `${claim.title} (₹${claim.amount}) was ${status}.`
  ).catch(() => console.error("Could not notify employee of reviewed expense", claim.id));

  return NextResponse.json({ claim });
}

/** DELETE — admin removes a claim (e.g. duplicate). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const where = { id, tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) };
  const removed = await prisma.expenseClaim.deleteMany({ where: { ...where, status: { in: ["pending", "rejected"] } } });
  if (!removed.count) {
    const claim = await prisma.expenseClaim.findFirst({ where, select: { id: true } });
    if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    return NextResponse.json({ error: "Delete only pending or rejected claims." }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
