import Link from "next/link";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination } from "@/lib/document-expense-pagination";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { isDateKey, monthKeyIST } from "@/lib/dates";
import { IST_OFFSET_MS } from "@/lib/ist";
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
  const [locations, tenant] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId: session.tenantId, ...(canManageSettings ? { isActive: true } : { id: assignedLocationId! }) },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } }),
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
      adjustments: true, documentSnapshot: true, payrollConfigurationId: true, payrollPolicyRules: true, inputSnapshot: true,
      pfEmployee: true, esicEmployee: true, professionalTax: true, tds: true,
      employee: {
        select: {
          id: true, employeeNumber: true, firstName: true, lastName: true,
          locationId: true, branchId: true, branch: { select: { locationId: true } },
          department: { select: { name: true } },
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
  const source = payslips.find((payslip) => payslip.payrollConfigurationId)?.payrollPolicyRules as { source?: string } | null;
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
      <PageHeader title="Employees missing a salary" description={`${selectedLocation?.name} · ${month}. Open an employee record to update their salary.`} />
      {employees.length ? <ul className="divide-y divide-edge rounded-xl border border-edge bg-card">
        {employees.map(employee => <li key={employee.id}><Link className="flex items-center justify-between gap-3 p-4 hover:bg-tint" href={`/admin/employee-master?${new URLSearchParams({ employee: employee.id, payPeriod: month, payLocation: locationId, payPage: String(pagination.page) })}`}>
          <span>{employee.firstName} {employee.lastName}</span><span className="text-sm text-muted-foreground">{employee.employeeNumber}</span>
        </Link></li>)}
      </ul> : <p role="status">All employees in this location and period have a salary recorded.</p>}
      <DocumentExpensePagination path="/admin/payroll" params={{ location: locationId, period: month, view: "missing-salaries" }} pagination={pagination} label="employees" />
    </div>;
  }
  const reference = new Date(`${month}-01T00:00:00Z`);
  reference.setUTCMonth(reference.getUTCMonth() - 1);
  const referenceMonth = reference.toISOString().slice(0, 7);
  const monthStart = new Date(new Date(`${month}-01T00:00:00Z`).getTime() - IST_OFFSET_MS);
  const monthEnd = new Date(payrollPreparationEnd(month).getTime() - IST_OFFSET_MS);
  const cohort = staffScope ? { ...staffScope, salary: { gt: 0 } } : null;
  const canRecalculateDraft = payroll?.status === "draft" && month >= currentMonth;
  const adjustableEmployees = payslips
    .filter(({ employee, status }) => canRecalculateDraft && status === "draft" &&
      (employee.branchId ? employee.branch?.locationId : employee.locationId) === locationId)
    .map(({ employee }) => employee.id);
  const [pendingCorrections, pendingLeaves, missingBank, missingPan, adjustments, referencePayslips] = await Promise.all([
    cohort ? prisma.punchCorrection.count({ where: { tenantId: session.tenantId, status: "pending", date: { gte: monthStart, lt: monthEnd }, employee: cohort } }) : 0,
    cohort ? prisma.leaveRequest.count({ where: { tenantId: session.tenantId, fromDate: { lt: monthEnd }, toDate: { gte: monthStart }, employee: cohort, OR: [{ status: "pending" }, { status: "approved", cancellationRequestedBy: { not: null } }] } }) : 0,
    cohort ? prisma.employee.count({ where: { ...cohort, OR: [{ accountNumber: null }, { accountNumber: "" }, { ifscCode: null }, { ifscCode: "" }] } }) : 0,
    cohort && effectivePolicy?.appliedRules.payrollConfig.tds.enabled ? prisma.employee.count({
      where: { ...cohort, AND: [...cohort.AND, { OR: [{ pan: null }, { pan: "" }] }, { NOT: { profile: { tdsAllowed: false } } }] },
    }) : 0,
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
    const bank = (inputSnapshot as { bank?: { accountNumber?: string; ifscCode?: string } } | null)?.bank;
    return {
      employee: {
        id: employee.id, employeeNumber: employee.employeeNumber, firstName: employee.firstName, lastName: employee.lastName,
        department: employee.department, hasBankDetails: Boolean(bank?.accountNumber && bank.ifscCode),
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
      readiness={{ pendingCorrections, pendingLeaves, missingBank, missingPan }}
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
      provenance={source ? { source: source.source ?? "recorded" } : null}
    />
  );
}
