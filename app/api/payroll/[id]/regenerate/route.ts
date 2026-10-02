import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  attendanceSummary,
  computePayroll,
  documentComponents,
  fyFromMonth,
  getPayrollConfig,
  payrollEmployeeForMonth,
  loanDeductionForMonth,
  loanDeductionAllocations,
  reverseLoanDeductionAllocations,
} from "@/lib/payroll";
import { payrollConfigFromSnapshot } from "@/lib/payroll-policy";
import { documentSnapshotForResponse } from "@/lib/payslip-document";
import { monthKeyIST } from "@/lib/dates";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

/** POST — recompute a single payslip from fresh attendance/adjustments/config (admin). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (
    !session ||
    (session.role !== "admin" && session.role !== "location_manager")
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId)
    return NextResponse.json(
      { error: "no location assigned" },
      { status: 403 },
    );

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.payslip.findFirst({
          where: {
            id,
            tenantId: session.tenantId,
            ...(locationId
              ? { employee: employeeLocationScope(locationId) }
              : {}),
          },
        });
        if (!existing)
          return NextResponse.json({ error: "not found" }, { status: 404 });
        if (existing.status !== "draft")
          return NextResponse.json(
            {
              error:
                "Only draft payslips can be regenerated. Finalized and paid payroll is immutable.",
            },
            { status: 409 },
          );
        if (existing.payrollRunId) {
          const run = await tx.payrollRun.updateMany({
            where: {
              id: existing.payrollRunId,
              tenantId: session.tenantId,
              status: "draft",
            },
            data: { status: "draft" },
          });
          if (run.count !== 1)
            return NextResponse.json(
              { error: "Only payslips in a draft run can be regenerated." },
              { status: 409 },
            );
        }
        const claimed = await tx.payslip.updateMany({
          where: {
            id,
            tenantId: session.tenantId,
            status: "draft",
            updatedAt: existing.updatedAt,
          },
          data: { status: "draft" },
        });
        if (claimed.count !== 1)
          throw new Error("PAYROLL_REGENERATION_CONFLICT");
        if (existing.month < monthKeyIST()) {
          return NextResponse.json(
            { error: "Prior-month payslips cannot be regenerated." },
            { status: 409 },
          );
        }

        const [tenant, employee] = await Promise.all([
          tx.tenant.findUnique({
            where: { id: session.tenantId },
            select: { config: true },
          }),
          tx.employee.findFirst({
            where: {
              id: existing.employeeId,
              tenantId: session.tenantId,
              ...(locationId ? employeeLocationScope(locationId) : {}),
            },
            select: {
              id: true,
              salary: true,
              salaryStructure: true,
              payMode: true,
              workBasisRate: true,
              shiftId: true,
              joiningDate: true,
              employmentProfile: {
                select: {
                  pfAllowed: true,
                  esicAllowed: true,
                  tdsAllowed: true,
                },
              },
            },
          }),
        ]);
        if (!employee || employee.salary == null) {
          return NextResponse.json(
            { error: "Employee salary not found." },
            { status: 400 },
          );
        }

        // Never resolve a currently active policy here. Existing post-activation
        // drafts use their saved inputs; older drafts retain legacy Tenant.config.
        const savedInput =
          existing.inputSnapshot &&
          typeof existing.inputSnapshot === "object" &&
          !Array.isArray(existing.inputSnapshot)
            ? (existing.inputSnapshot as Record<string, unknown>)
            : {};
        const savedEmployee =
          savedInput.employee && typeof savedInput.employee === "object"
            ? (savedInput.employee as Record<string, unknown>)
            : {};
        const statutory =
          savedInput.statutory && typeof savedInput.statutory === "object"
            ? (savedInput.statutory as Record<string, unknown>)
            : (employee.employmentProfile ?? {});
        const joiningDate = Object.hasOwn(savedEmployee, "joiningDate") ? (typeof savedEmployee.joiningDate === "string" ? new Date(savedEmployee.joiningDate) : null) : employee.joiningDate;
        const savedPolicy =
          savedInput.policy && typeof savedInput.policy === "object"
            ? savedInput.policy
            : null;
        const configured =
          payrollConfigFromSnapshot(savedPolicy) ??
          payrollConfigFromSnapshot(existing.payrollPolicyRules) ??
          getPayrollConfig(tenant?.config ?? null);
        const config = {
          ...configured,
          pf: {
            ...configured.pf,
            enabled: configured.pf.enabled && statutory.pfAllowed !== false,
          },
          esic: {
            ...configured.esic,
            enabled: configured.esic.enabled && statutory.esicAllowed !== false,
          },
          tds: {
            ...configured.tds,
            enabled: configured.tds.enabled && statutory.tdsAllowed !== false,
          },
        };
        const summary = await attendanceSummary(
          session.tenantId,
          {
            id: employee.id,
            shiftId: employee.shiftId,
            joiningDate,
          },
          existing.month,
          true,
          tx,
        );
        const [loans, adjustments, taxDecl] = await Promise.all([
          tx.employeeLoan.findMany({
            where: { tenantId: session.tenantId, employeeId: employee.id },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              status: true,
              startMonth: true,
              lastDeductedMonth: true,
              outstanding: true,
              emiAmount: true,
              amount: true,
            },
          }),
          tx.payrollAdjustment.findMany({
            where: {
              tenantId: session.tenantId,
              employeeId: employee.id,
              month: existing.month,
            },
            select: { id: true, type: true, label: true, amount: true },
          }),
          tx.taxDeclaration.findUnique({
            where: {
              employeeId_fy: {
                employeeId: employee.id,
                fy: fyFromMonth(existing.month),
              },
            },
            select: { sections: true, status: true },
          }),
        ]);
        const decl = (taxDecl?.sections ?? {}) as Record<string, number>;
        const investments =
          taxDecl?.status === "verified" ? Number(decl.total ?? 0) || 0 : 0;

        // Roll back the prior month's allocation in memory first. Regeneration can
        // reduce the loan cap, so the old deduction must be returned before the new
        // allocation is calculated and persisted in the same transaction.
        const priorAllocations = Array.isArray(savedInput.loanAllocations)
          ? savedInput.loanAllocations
          : [];
        if (
          existing.loanDeduction > 0 &&
          (!priorAllocations.length ||
            Math.abs(
              priorAllocations.reduce(
                (total, value) => total + Number(value?.amount ?? 0),
                0,
              ) - existing.loanDeduction,
            ) > 0.005)
        )
          throw new Error("PAYROLL_LOAN_REVERSAL_CONFLICT");
        const reversals = reverseLoanDeductionAllocations(
          loans,
          priorAllocations,
          existing.month,
        );
        if (!reversals) throw new Error("PAYROLL_LOAN_REVERSAL_CONFLICT");
        const restoredLoans = loans.map((loan) => {
          const reversal = reversals.find((item) => item.id === loan.id);
          return reversal
            ? {
                ...loan,
                outstanding: reversal.outstanding,
                lastDeductedMonth: null,
                status: "active",
              }
            : loan;
        });
        const restoredLoanTotal = existing.loanDeduction;
        const { total: loanDeduction } = loanDeductionForMonth(
          restoredLoans,
          existing.month,
        );
        const savedAssignments = Array.isArray(savedInput.componentAssignments)
          ? savedInput.componentAssignments
          : [];
        const assignedComponentCodes = savedAssignments.flatMap((assignment) =>
          assignment &&
          typeof assignment === "object" &&
          !Array.isArray(assignment) &&
          typeof (assignment as { componentCode?: unknown }).componentCode ===
            "string"
            ? [(assignment as { componentCode: string }).componentCode]
            : [],
        );
        const result = computePayroll(
          config,
          payrollEmployeeForMonth(
            {
              salary:
                typeof savedEmployee.salary === "number"
                  ? savedEmployee.salary
                  : employee.salary,
              salaryStructure: (Object.hasOwn(savedEmployee, "salaryStructure")
                ? savedEmployee.salaryStructure
                : employee.salaryStructure) as typeof employee.salaryStructure,
              payMode:
                typeof savedEmployee.payMode === "string"
                  ? savedEmployee.payMode
                  : employee.payMode,
              workBasisRate:
                Object.hasOwn(savedEmployee, "workBasisRate")
                  ? (typeof savedEmployee.workBasisRate === "number" ? savedEmployee.workBasisRate : null)
                  : employee.workBasisRate,
              joiningDate,
            },
            existing.month,
          ),
          summary,
          loanDeduction,
          existing.month,
          adjustments,
          investments,
          { assignedComponentCodes },
        );

        const iso = new Date().toISOString();
        const previousDocument = documentSnapshotForResponse(
          existing.documentSnapshot,
        );
        const documentSnapshot = previousDocument
          ? {
              ...previousDocument,
              version: 2 as const,
              generatedAt: iso,
              days: {
                payable: result.payableDays,
                paid:
                  result.presentDays +
                  result.lateDays +
                  result.halfDays * 0.5 +
                  result.paidLeaveDays,
                lop:
                  result.absentDays +
                  result.halfDays * 0.5 +
                  result.unpaidLeaveDays,
              },
              components: documentComponents(result),
              totals: {
                gross: result.grossEarnings,
                earnedGross: result.earnedGross,
                deductions: result.deductions,
                net: result.netSalary,
              },
            }
          : null;
        const loanAllocations = loanDeductionAllocations(
          restoredLoans,
          loanDeductionForMonth(
            restoredLoans,
            existing.month,
            result.loanDeduction,
          ).updates,
        );
        const inputSnapshot = {
          ...savedInput,
          version: 2,
          attendance: summary,
          result,
          loanAllocations,
        };

        for (const loan of loans) {
          const restored = restoredLoans.find(
            (candidate) => candidate.id === loan.id,
          );
          if (restored && restored.outstanding !== loan.outstanding) {
            await tx.employeeLoan.update({
              where: { id: loan.id },
              data: {
                outstanding: restored.outstanding,
                lastDeductedMonth: null,
                status: "active",
              },
            });
          }
        }
        const updated = await tx.payslip.update({
          where: { id },
          data: {
            baseSalary: result.baseSalary,
            basicSalary: result.basic,
            allowances: result.allowances,
            overtimePay: result.overtimePay,
            grossEarnings: result.grossEarnings,
            gratuity: result.gratuity,
            pfEmployee: result.pfEmployee,
            pfEmployer: result.pfEmployer,
            esicEmployee: result.esicEmployee,
            esicEmployer: result.esicEmployer,
            professionalTax: result.professionalTax,
            lwf: result.lwf,
            tds: result.tds,
            lateFines: result.lateFines,
            loanDeduction: result.loanDeduction,
            absentDeduction: result.absentDeduction,
            workingDays: result.workingDays,
            divisorUsed: result.divisorUsed,
            onLeaveDays: result.onLeaveDays,
            deductions: result.deductions,
            netSalary: result.netSalary,
            adjustments: result.adjustments as unknown as Prisma.InputJsonValue,
            salaryBreakdown:
              result.salaryBreakdown as unknown as Prisma.InputJsonValue,
            inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
            ...(documentSnapshot
              ? {
                  documentSnapshot:
                    documentSnapshot as unknown as Prisma.InputJsonValue,
                }
              : {}),
            presentDays: result.presentDays,
            lateDays: result.lateDays,
            halfDays: result.halfDays,
            absentDays: result.absentDays,
            overtimeHours: result.overtimeHours,
            workedHours: result.workedHours,
            note: existing.note
              ? `${existing.note} | regenerated ${iso}`
              : `regenerated ${iso}`,
          },
        });
        if (existing.payrollRunId)
          await tx.payrollRunMember.updateMany({
            where: {
              payrollRunId: existing.payrollRunId,
              employeeId: existing.employeeId,
            },
            data: {
              inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
            },
          });
        const allocations = loanDeductionForMonth(
          restoredLoans,
          existing.month,
          result.loanDeduction,
        ).updates;
        for (const loan of allocations) {
          await tx.employeeLoan.update({
            where: { id: loan.id },
            data: {
              outstanding: loan.newOutstanding,
              lastDeductedMonth: loan.lastDeductedMonth,
              status: loan.close ? "closed" : "active",
            },
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId: session.tenantId,
            actorId: session.sub,
            actorRole: session.role,
            action: "payslip.regenerate",
            entity: "Payslip",
            entityId: id,
            summary: `Regenerated ${existing.month} net ${Number(existing.netSalary)} -> ${Number(updated.netSalary)}; loan restored ${restoredLoanTotal}`,
            before: { netSalary: Number(existing.netSalary) },
            after: { netSalary: Number(updated.netSalary) },
          },
        });

        return NextResponse.json({ payslip: updated });
      },
      { isolationLevel: "Serializable", timeout: 20000 },
    );
  } catch (error) {
    if (
      (error as { code?: string })?.code === "P2034" ||
      (error instanceof Error &&
        error.message === "PAYROLL_REGENERATION_CONFLICT")
    )
      return NextResponse.json(
        {
          error: "Payroll changed during regeneration. Refresh and try again.",
        },
        { status: 409 },
      );
    if (
      error instanceof Error &&
      error.message === "PAYROLL_LOAN_REVERSAL_CONFLICT"
    )
      return NextResponse.json(
        {
          error:
            "The recorded loan allocations cannot be safely restored. Regeneration was rolled back.",
        },
        { status: 409 },
      );
    throw error;
  }
}
