import Link from "next/link";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination } from "@/lib/document-expense-pagination";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { isDateKey, monthKeyIST } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import { monthRange } from "@/lib/payroll";
import { payrollRunPreflightDetails } from "@/lib/payroll-preflight";
import { canReviewLeaveRequest } from "@/lib/leave-lifecycle";
import { getTenantAccess } from "@/lib/modules-server";
import type { Prisma } from "@/generated/prisma/client";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { documentSnapshotForResponse } from "@/lib/payslip-document";
import { legacyMessComponentCodes } from "@/lib/payroll-recovery";
import { requiresPublishedPayrollPolicy, resolvePayrollPolicy } from "@/lib/payroll-policy";
import { payrollScopeHref } from "@/lib/payroll-work-queue";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { supportsIndiaPayroll, workspaceRegion } from "@/lib/workspace-region";
import { manualUploadId } from "@/lib/payroll-manual-source";
import { payrollPreparationEnd } from "@/lib/payroll-prepare";
import { FINANCIAL_HISTORY_RUN_STATUSES } from "@/lib/payroll-reporting";
import { PayrollPanel } from "./payroll-panel";
import { payrollEmployeeFixHref } from "./payroll-readiness";

export const dynamic = "force-dynamic";

const payrollPath = "/admin/payroll";

export default async function PayrollPage({ searchParams }: {
  searchParams: Promise<{ month?: string; period?: string; location?: string; run?: string; view?: string; page?: string }>;
}) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee");
  const canManageSettings = session.role === "admin";
  const [params, assignedLocationId] = await Promise.all([searchParams, managerLocationId(session)]);
  if (!canManageSettings && !assignedLocationId) {
    return <PageHeader title="Monthly payroll" description="Ask an administrator to assign a payroll location to your account." />;
  }
  if (params.month && !params.period) {
    redirect(payrollScopeHref(payrollPath, { period: params.month, locationId: params.location, runId: params.run }));
  }

  const currentMonth = monthKeyIST();
  const month = typeof params.period === "string" && isDateKey(`${params.period}-01`) ? params.period : currentMonth;
  const [locations, tenant, access] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId: session.tenantId, ...(canManageSettings ? { isActive: true } : { id: assignedLocationId! }) },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } }),
    getTenantAccess(session.tenantId),
  ]);
  const requestedLocationId = canManageSettings ? params.location || (locations.length === 1 ? locations[0].id : null) : assignedLocationId;
  const selectedLocation = locations.find((location) => location.id === requestedLocationId);
  const locationId = selectedLocation?.id ?? null;
  const [payrolls, policies] = locationId ? await Promise.all([
    prisma.payrollRun.findMany({
      where: { tenantId: session.tenantId, month, locationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, month: true, status: true, createdBy: true,
        _count: { select: { payslips: true, members: true } },
        members: {
          where: { exception: { not: null } },
          select: { id: true, exception: true, employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.configurationRecord.findMany({
      where: { tenantId: session.tenantId, kind: "payroll_policy", active: true, OR: [{ locationId }, { locationId: null }] },
      select: { id: true, locationId: true, version: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true },
    }),
  ]) : [[], []];

  const effectivePolicy = locationId ? resolvePayrollPolicy(policies, tenant.config, locationId, month) : null;
  const payrollSettingsRequired = Boolean(locationId && requiresPublishedPayrollPolicy(tenant.config) && !effectivePolicy?.configurationId);
  const supportsGeneration = supportsIndiaPayroll(workspaceRegion(tenant.config));
  const generationUnavailableReason = !supportsGeneration
    ? "Built-in payroll generation requires an India workspace with INR currency. Existing runs and reports are available."
    : selectedLocation && !selectedLocation.isActive
      ? "Select an active payroll location before generating payslips."
      : null;
  const activePayroll = payrolls.find((candidate) => !["cancelled", "reversed"].includes(candidate.status)) ?? null;
  // Stale or out-of-scope run IDs must never replace the active run with a new-run form.
  const payroll = payrolls.find((candidate) => candidate.id === params.run) ?? activePayroll;
  const payslips = payroll ? await prisma.payslip.findMany({
    where: { tenantId: session.tenantId, payrollRunId: payroll.id },
    orderBy: { employee: { employeeNumber: "asc" } },
    select: {
      id: true, grossEarnings: true, deductions: true, netSalary: true, status: true,
      adjustments: true, documentSnapshot: true, inputSnapshot: true,
      pfEmployee: true, esicEmployee: true, professionalTax: true, tds: true,
      employee: {
        select: {
          id: true, employeeNumber: true, firstName: true, lastName: true,
          locationId: true, branchId: true, branch: { select: { locationId: true } },
          department: { select: { name: true } },
          accountNumber: true, ifscCode: true, pan: true,
        },
      },
    },
  }) : [];
  const totals = payslips.reduce((value, payslip) => ({
    gross: value.gross + payslip.grossEarnings,
    deductions: value.deductions + payslip.deductions,
    net: value.net + payslip.netSalary,
    paid: value.paid + (payslip.status === "paid" ? 1 : 0),
  }), { gross: 0, deductions: 0, net: 0, paid: 0 });
  const notIncludedCount = payroll && locationId ? await prisma.employee.count({
    where: {
      tenantId: session.tenantId, status: "active", loginOnly: false, ...employeeLocationScope(locationId),
      NOT: { payslips: { some: { payrollRunId: payroll.id } } },
    },
  }) : 0;
  const workbookUploadId = payslips.length ? manualUploadId(payslips[0].inputSnapshot) : null;
  const attendanceSource = payslips.length ? (workbookUploadId ? "workbook" : "recorded") : null;
  const staffScope = locationId && !payroll && !generationUnavailableReason
    ? {
      tenantId: session.tenantId, status: "active", loginOnly: false,
      AND: [employeeLocationScope(locationId), { OR: [{ joiningDate: null }, { joiningDate: { lt: payrollPreparationEnd(month) } }] }],
    }
    : null;
  const missingSalaryWhere = { ...staffScope, OR: [{ salary: null }, { salary: { lte: 0 } }] };
  const [staffCount, missingSalary] = staffScope ? await Promise.all([
    prisma.employee.count({ where: staffScope }),
    prisma.employee.count({ where: missingSalaryWhere }),
  ]) : [0, 0];
  if (params.view === "missing-salaries" && staffScope && locationId) {
    const pagination = recordPagination(missingSalary, recordPageNumber(params.page) ?? 1, 25);
    const employees = await prisma.employee.findMany({
      where: missingSalaryWhere,
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: [{ employeeNumber: "asc" }, { id: "asc" }],
      skip: pagination.offset,
      take: pagination.pageSize,
    });
    return <div className="space-y-5">
      <Link className="text-sm font-medium text-primary underline" href={payrollScopeHref("/admin/payroll", { locationId, period: month })}>Back to monthly payroll</Link>
      <PageHeader title="Employees missing a salary" description={`${selectedLocation?.name} · ${month}. ${canManageSettings ? "Set a starting salary before adding the employee to payroll." : "Ask a payroll administrator to set these starting salaries."}`} />
      {employees.length ? <ul className="divide-y divide-edge rounded-xl border border-edge bg-card">
        {employees.map(employee => <li key={employee.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-medium">{employee.firstName} {employee.lastName}</p><p className="text-sm text-muted-foreground">{employee.employeeNumber}</p></div>
          {canManageSettings && access.modules.has("employees") ? <Link className="inline-flex min-h-10 items-center font-medium text-primary underline" href={payrollEmployeeFixHref({ locationId, period: month, stage: "inputs", view: "missing-salaries", page: pagination.page }, employee.id, "salary")}>Set starting salary <span className="sr-only">for {employee.firstName} {employee.lastName}</span></Link>
            : <span className="text-sm text-muted-foreground">Payroll administrator</span>}
        </li>)}
      </ul> : <p role="status">All employees in this location and period have a salary recorded.</p>}
      <DocumentExpensePagination path="/admin/payroll" params={{ location: locationId, period: month, view: "missing-salaries" }} pagination={pagination} label="employees" />
    </div>;
  }
  const reference = new Date(`${month}-01T00:00:00Z`);
  reference.setUTCMonth(reference.getUTCMonth() - 1);
  const referenceMonth = reference.toISOString().slice(0, 7);
  const { start: monthStart, end: monthEnd } = monthRange(month);
  const editableRun = payroll && ["draft", "reviewed", "approved"].includes(payroll.status);
  const cohort: Prisma.EmployeeWhereInput | null = editableRun
    ? { id: { in: payslips.map(({ employee }) => employee.id) } }
    : staffScope ? { ...staffScope, salary: { gt: 0 } } : null;
  const correctionWhere: Prisma.PunchCorrectionWhereInput = { tenantId: session.tenantId, employee: cohort ?? undefined, status: "pending", date: { gte: monthStart, lt: monthEnd } };
  const leaveWhere: Prisma.LeaveRequestWhereInput = {
    tenantId: session.tenantId, employee: cohort ?? undefined,
    fromDate: { lt: monthEnd }, toDate: { gte: monthStart },
    OR: [{ status: "pending" }, { status: "approved", cancellationRequestedBy: { not: null } }],
  };
  const initialBankWhere: Prisma.EmployeeWhereInput | null = cohort && !payroll
    ? { AND: [cohort, { OR: [{ accountNumber: null }, { accountNumber: "" }, { ifscCode: null }, { ifscCode: "" }] }] } : null;
  const initialPanWhere: Prisma.EmployeeWhereInput | null = cohort && !payroll && effectivePolicy?.appliedRules.payrollConfig.tds.enabled
    ? { AND: [cohort, { OR: [{ pan: null }, { pan: "" }] }, { OR: [{ employmentProfile: null }, { employmentProfile: { tdsAllowed: null } }, { employmentProfile: { tdsAllowed: true } }] }] } : null;
  const person = { id: true, employeeNumber: true, firstName: true, lastName: true } as const;
  const requestPerson = { ...person, branchId: true, locationId: true, branch: { select: { locationId: true } } } as const;
  const personDetails = (employee: { id: string; employeeNumber: string; firstName: string; lastName: string }) => ({
    employeeId: employee.id, employeeNumber: employee.employeeNumber, name: `${employee.firstName} ${employee.lastName}`.trim(),
  });
  const checkLimit = 16;
  const canRecalculateDraft = payroll?.status === "draft" && month >= currentMonth;
  const adjustableEmployees = payslips
    .filter(({ employee, status }) => canRecalculateDraft && status === "draft" &&
      (employee.branchId ? employee.branch?.locationId : employee.locationId) === locationId)
    .map(({ employee }) => employee.id);
  const [pendingCorrections, corrections, pendingLeaves, leaves, missingBank, bank, missingPan, pan, adjustments, referencePayslips] = await Promise.all([
    cohort ? prisma.punchCorrection.count({ where: correctionWhere }) : 0,
    cohort ? prisma.punchCorrection.findMany({
      where: correctionWhere,
      select: { id: true, date: true, employee: { select: requestPerson } },
      orderBy: [{ date: "asc" }, { id: "asc" }], take: checkLimit,
    }) : [],
    cohort ? prisma.leaveRequest.count({ where: leaveWhere }) : 0,
    cohort ? prisma.leaveRequest.findMany({
      where: leaveWhere,
      select: { id: true, employeeId: true, fromDate: true, toDate: true, status: true, createdBy: true, cancellationRequestedBy: true, employee: { select: requestPerson } },
      orderBy: [{ fromDate: "asc" }, { id: "asc" }], take: checkLimit,
    }) : [],
    initialBankWhere ? prisma.employee.count({ where: initialBankWhere }) : 0,
    initialBankWhere ? prisma.employee.findMany({ where: initialBankWhere, select: person, orderBy: [{ employeeNumber: "asc" }, { id: "asc" }], take: checkLimit }) : [],
    initialPanWhere ? prisma.employee.count({ where: initialPanWhere }) : 0,
    initialPanWhere ? prisma.employee.findMany({ where: initialPanWhere, select: person, orderBy: [{ employeeNumber: "asc" }, { id: "asc" }], take: checkLimit }) : [],
    adjustableEmployees.length ? prisma.payrollAdjustment.findMany({
      where: { tenantId: session.tenantId, month, employeeId: { in: adjustableEmployees } },
      select: { id: true, employeeId: true, type: true, label: true, amount: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }) : [],
    payroll && locationId ? prisma.payslip.findMany({
      where: {
        tenantId: session.tenantId, month: referenceMonth,
        payrollRun: { locationId, month: referenceMonth, status: { in: [...FINANCIAL_HISTORY_RUN_STATUSES] } },
      },
      select: { employeeId: true, netSalary: true, employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
      orderBy: [{ payrollRun: { createdAt: "desc" } }, { id: "desc" }],
    }) : [],
  ]);
  const rows = payslips.map(({ employee, id, grossEarnings, deductions, netSalary, status, adjustments, documentSnapshot, inputSnapshot }) => {
    const snapshot = inputSnapshot as { bank?: { accountNumber?: string; ifscCode?: string }; policy?: { payrollConfig?: { tds?: { enabled?: boolean } } }; employee?: { pan?: string | null }; statutory?: { tdsAllowed?: boolean | null } } | null;
    const missingPan = Boolean(snapshot?.policy?.payrollConfig?.tds?.enabled && snapshot.statutory?.tdsAllowed !== false && !snapshot.employee?.pan);
    const canEditPaymentRecord = canManageSettings && access.modules.has("employees");
    return {
      employee: {
        id: employee.id, employeeNumber: employee.employeeNumber, firstName: employee.firstName, lastName: employee.lastName,
        department: employee.department, hasBankDetails: Boolean(snapshot?.bank?.accountNumber && snapshot.bank.ifscCode),
        hasCurrentBank: Boolean(employee.accountNumber && employee.ifscCode),
        hasCurrentPan: Boolean(employee.pan),
        canEditPaymentRecord,
        inLocation: (employee.branchId ? employee.branch?.locationId : employee.locationId) === locationId,
        missingPan,
      },
      payslip: {
        id, grossEarnings, deductions, netSalary, status,
        adjustments: Array.isArray(adjustments) ? adjustments as { label: string; amount: number }[] : null,
        document: documentSnapshotForResponse(documentSnapshot),
        canRecalculate: payroll?.status === "draft" && status === "draft" && month >= currentMonth &&
          (canManageSettings || (employee.branchId ? employee.branch?.locationId : employee.locationId) === assignedLocationId),
      },
    };
  });

  return (
    <PayrollPanel
      month={month}
      locationLabel={selectedLocation?.name ?? "Select location"}
      locationId={locationId}
      locations={canManageSettings ? locations.map(({ id, name }) => ({ id, name })) : []}
      runs={payrolls.map((candidate) => ({ id: candidate.id, status: candidate.status, payslipCount: candidate._count.payslips }))}
      rows={rows}
      financialIssues={payslips.length ? payrollRunPreflightDetails(payslips) : []}
      totals={totals}
      generated={payslips.length}
      notIncludedCount={notIncludedCount}
      canManageSettings={canManageSettings}
      payrollSettingsRequired={payrollSettingsRequired}
      canRecoverLegacyMess={legacyMessComponentCodes(policies).length > 0}
      generationUnavailableReason={generationUnavailableReason}
      attendanceSource={attendanceSource}
      workbookUploadId={workbookUploadId}
      preparation={staffScope ? { eligible: staffCount - missingSalary, missingSalary } : null}
      readiness={{
        pendingCorrections, pendingLeaves, missingBank, missingPan,
        corrections: corrections.map(({ id, date, employee }) => ({
          id, date: istDateKey(date), ...personDetails(employee), branchId: employee.branchId,
          canAct: access.modules.has("attendance") && employee.id !== session.sub && (canManageSettings || employee.branch?.locationId === locationId),
        })),
        leaves: leaves.map(request => ({
          id: request.id, date: istDateKey(request.fromDate), endDate: istDateKey(request.toDate), ...personDetails(request.employee),
          branchId: request.employee.branchId,
          cancellation: request.status === "approved",
          canAct: access.modules.has("leaves") && canReviewLeaveRequest(request, session.sub) && request.cancellationRequestedBy !== session.sub
            && (canManageSettings || (request.employee.branchId ? request.employee.branch?.locationId : request.employee.locationId) === locationId),
        })),
        bank: bank.map(employee => ({ id: employee.id, ...personDetails(employee), canAct: canManageSettings && access.modules.has("employees") })),
        pan: pan.map(employee => ({ id: employee.id, ...personDetails(employee), canAct: canManageSettings && access.modules.has("employees") })),
      }}
      adjustments={adjustments}
      adjustableEmployees={adjustableEmployees}
      referenceMonth={referenceMonth}
      referencePayslips={referencePayslips.map(({ employeeId, netSalary, employee }) => ({
        employeeId, netSalary, name: `${employee.firstName} ${employee.lastName}`.trim(), employeeNumber: employee.employeeNumber,
      }))}
      statutory={payslips.reduce((sum, item) => ({
        pf: sum.pf + item.pfEmployee, esi: sum.esi + item.esicEmployee, pt: sum.pt + item.professionalTax, tds: sum.tds + item.tds,
      }), { pf: 0, esi: 0, pt: 0, tds: 0 })}
      actorId={session.sub}
      payroll={payroll}
    />
  );
}
