import { payrollSourceReview } from "@/lib/payroll-source-review";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canTransitionPayrollRun,
  paymentEvidence,
  payrollRunAuditData,
  payrollRunTransitionData,
  type PayrollRunStatus,
} from "@/lib/payroll-runs";
import { payrollRunPreflight } from "@/lib/payroll-preflight";
import { payrollOperationLocationId } from "@/lib/location-scope";
import {
  reverseLoanDeductionAllocations,
  type LoanDeductionAllocation,
} from "@/lib/payroll";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireActiveSession().catch(() => null);
  if (
    !session ||
    (session.role !== "admin" && session.role !== "location_manager")
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const target = String(body.status ?? "") as PayrollRunStatus;
  const scope = await payrollOperationLocationId(
    session,
    typeof body.locationId === "string" ? body.locationId : null,
  );
  if ("error" in scope)
    return NextResponse.json(
      { error: scope.error },
      { status: session.role === "location_manager" ? 403 : 400 },
    );
  try {
    return await prisma.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.findFirst({
          where: {
            id,
            tenantId: session.tenantId,
            locationId: scope.locationId,
          },
          include: {
            payslips: {
              select: {
                id: true,
                employeeId: true,
                employee: { select: { id: true, shiftId: true, joiningDate: true, firstName: true, lastName: true } },
                grossEarnings: true,
                deductions: true,
                netSalary: true,
                loanDeduction: true,
                inputSnapshot: true,
                documentSnapshot: true,
              },
            },
          },
        });
        if (!run)
          return NextResponse.json({ error: "not found" }, { status: 404 });
        const claimed = await tx.payrollRun.updateMany({
          where: {
            id,
            tenantId: session.tenantId,
            locationId: scope.locationId,
            status: run.status,
          },
          data: { status: run.status },
        });
        if (claimed.count !== 1) throw new Error("PAYROLL_RUN_CONFLICT");
        if (!canTransitionPayrollRun(run.status, target))
          return NextResponse.json(
            { error: `Cannot move a ${run.status} run directly to ${target}.` },
            { status: 409 },
          );
        if (target === "approved" && run.createdBy === session.sub)
          return NextResponse.json(
            { error: "The run creator cannot approve their own payroll run." },
            { status: 403 },
          );
        if (target === "reviewed" && run.payslips.length === 0)
          return NextResponse.json(
            { error: "A run with no payslips cannot be reviewed." },
            { status: 409 },
          );
        if (["reviewed", "approved", "finalized"].includes(target)) {
          const errors = await payrollSourceReview(tx, session.tenantId, run.month, run.payslips);
          if (errors.length) return NextResponse.json({ error: errors.slice(0, 10).join(" "), preflight: errors }, { status: 409 });
        }
        if (["approved", "finalized", "paid"].includes(target) && run.payslips.some((p) =>
          ![p.grossEarnings, p.deductions, p.netSalary].every(Number.isFinite) ||
          p.netSalary < 0 || p.deductions < 0 || p.deductions > p.grossEarnings ||
          Math.abs(p.grossEarnings - p.deductions - p.netSalary) > 0.005))
          return NextResponse.json(
            {
              error: "Resolve invalid or unreconciled payroll amounts before approval, finalization or payment.",
            },
            { status: 409 },
          );
        if (["approved", "finalized", "paid"].includes(target)) {
          const errors = payrollRunPreflight(run.payslips);
          if (errors.length)
            return NextResponse.json(
              { error: errors.join(" "), preflight: errors },
              { status: 409 },
            );
        }
        const cancellationReason =
          ["cancelled", "draft"].includes(target) ? String(body.reason ?? "").trim() : "";
        if (
          ["cancelled", "draft"].includes(target) &&
          (!cancellationReason || cancellationReason.length > 500)
        )
          return NextResponse.json(
            {
              error: "A cancellation or return-to-draft reason is required (max 500 characters).",
            },
            { status: 400 },
          );
        const loanAllocations: LoanDeductionAllocation[] = [];
        if (target === "cancelled") {
          for (const slip of run.payslips) {
            if (slip.loanDeduction <= 0) continue;
            const snapshot = slip.inputSnapshot;
            const allocations =
              snapshot &&
              typeof snapshot === "object" &&
              !Array.isArray(snapshot)
                ? (snapshot as { loanAllocations?: unknown }).loanAllocations
                : null;
            if (!Array.isArray(allocations))
              return NextResponse.json(
                {
                  error:
                    "This payroll predates loan allocation snapshots and cannot be safely cancelled. Draft payslips can be regenerated to record them.",
                },
                { status: 409 },
              );
            const allocationStart = loanAllocations.length;
            for (const allocation of allocations) {
              if (
                !allocation ||
                typeof allocation !== "object" ||
                Array.isArray(allocation)
              )
                return NextResponse.json(
                  {
                    error:
                      "Loan allocation data is invalid; payroll was not cancelled.",
                  },
                  { status: 409 },
                );
              const { id: loanId, amount } = allocation as {
                id?: unknown;
                amount?: unknown;
              };
              if (
                typeof loanId !== "string" ||
                !Number.isFinite(amount) ||
                Number(amount) <= 0
              )
                return NextResponse.json(
                  {
                    error:
                      "Loan allocation data is invalid; payroll was not cancelled.",
                  },
                  { status: 409 },
                );
              loanAllocations.push({ id: loanId, amount: Number(amount) });
            }
            const allocationTotal = loanAllocations
              .slice(allocationStart)
              .reduce((total, allocation) => total + allocation.amount, 0);
            if (Math.abs(allocationTotal - slip.loanDeduction) > 0.005)
              return NextResponse.json(
                {
                  error:
                    "Loan allocation data does not match the payslip; payroll was not cancelled.",
                },
                { status: 409 },
              );
          }
        }
        const net = run.payslips.reduce(
          (total, slip) => total + slip.netSalary,
          0,
        );
        const evidence =
          target === "paid"
            ? paymentEvidence(body, run.payslips.length, net)
            : null;
        if (evidence && "error" in evidence)
          return NextResponse.json({ error: evidence.error }, { status: 400 });
        // Reversal is deliberately a terminal record only; it never mutates paid slips.
        if (target === "cancelled" && loanAllocations.length) {
          const loans = await tx.employeeLoan.findMany({
            where: {
              tenantId: session.tenantId,
              id: { in: loanAllocations.map((allocation) => allocation.id) },
            },
            select: { id: true, outstanding: true, lastDeductedMonth: true },
          });
          const reversals = reverseLoanDeductionAllocations(
            loans,
            loanAllocations,
            run.month,
          );
          if (!reversals) throw new Error("PAYROLL_LOAN_REVERSAL_CONFLICT");
          for (const reversal of reversals) {
            const restored = await tx.employeeLoan.updateMany({
              where: {
                id: reversal.id,
                tenantId: session.tenantId,
                lastDeductedMonth: run.month,
                outstanding: loans.find((loan) => loan.id === reversal.id)!
                  .outstanding,
              },
              data: {
                outstanding: reversal.outstanding,
                lastDeductedMonth: null,
                status: "active",
              },
            });
            if (restored.count !== 1)
              throw new Error("PAYROLL_LOAN_REVERSAL_CONFLICT");
          }
        }
        const next = await tx.payrollRun.update({
          where: { id },
          data: {
            ...payrollRunTransitionData(target, session.sub),
            ...(evidence?.value ?? {}),
            ...(target === "cancelled" ? { note: cancellationReason } : {}),
          },
        });
        if (target === "paid")
          await tx.payslip.updateMany({
            where: { payrollRunId: id },
            data: {
              status: "paid",
              paidAt: new Date(),
              paidVia: evidence!.value.paymentMethod,
              paymentRef: evidence!.value.paymentReference,
            },
          });
        if (target === "finalized")
          await tx.payslip.updateMany({
            where: { payrollRunId: id },
            data: { status: "finalized" },
          });
        await tx.auditLog.create({
          data: {
            ...payrollRunAuditData(
              id,
              session.tenantId,
              session.sub,
              session.role,
              run.status,
              target,
            ),
            ...(target === "paid" || target === "cancelled" || target === "draft"
              ? {
                  after: {
                    status: target,
                    ...(target === "paid"
                      ? { ...evidence!.value, count: run.payslips.length, net }
                      : { reason: cancellationReason }),
                  },
                }
              : {}),
          },
        });
        return NextResponse.json({ run: next });
      },
      { isolationLevel: "Serializable", timeout: 60000 },
    );
  } catch (error) {
    if (
      (error as { code?: string })?.code === "P2034" ||
      (error instanceof Error && error.message === "PAYROLL_RUN_CONFLICT")
    )
      return NextResponse.json(
        { error: "Payroll changed during this action. Refresh and try again." },
        { status: 409 },
      );
    if (
      error instanceof Error &&
      error.message === "PAYROLL_LOAN_REVERSAL_CONFLICT"
    )
      return NextResponse.json(
        {
          error:
            "Loan balances changed after this payroll was generated; payroll was not cancelled.",
        },
        { status: 409 },
      );
    throw error;
  }
}
