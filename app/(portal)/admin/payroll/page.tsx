import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
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
import { PayrollPanel } from "./payroll-panel";

export const dynamic = "force-dynamic";

const payrollPath = "/admin/payroll";

export default async function PayrollPage({ searchParams }: {
  searchParams: Promise<{ month?: string; period?: string; location?: string; run?: string }>;
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
  const month = params.period && isMonthKey(params.period) ? params.period : currentMonth;
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
      employee: {
        select: {
          id: true, employeeNumber: true, firstName: true, lastName: true,
          accountNumber: true, ifscCode: true, locationId: true, branchId: true, branch: { select: { locationId: true } },
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
  const [staffCount, missingSalary] = staffScope ? await Promise.all([
    prisma.employee.count({ where: staffScope }),
    prisma.employee.count({ where: { ...staffScope, OR: [{ salary: null }, { salary: { lte: 0 } }] } }),
  ]) : [0, 0];
  const rows = payslips.map(({ employee, id, grossEarnings, deductions, netSalary, status, adjustments, documentSnapshot }) => ({
    employee: {
      id: employee.id, employeeNumber: employee.employeeNumber, firstName: employee.firstName, lastName: employee.lastName,
      department: employee.department, hasBankDetails: Boolean(employee.accountNumber && employee.ifscCode),
    },
    payslip: {
      id, grossEarnings, deductions, netSalary, status,
      adjustments: (adjustments ?? null) as { label: string; amount: number }[] | null,
      document: documentSnapshotForResponse(documentSnapshot),
      canRecalculate: payroll?.status === "draft" && status === "draft" && month >= currentMonth &&
        (canManageSettings || (employee.branchId ? employee.branch?.locationId : employee.locationId) === assignedLocationId),
    },
  }));

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
      actorId={session.sub}
      payroll={payroll}
      provenance={source ? { source: source.source ?? "recorded" } : null}
    />
  );
}
