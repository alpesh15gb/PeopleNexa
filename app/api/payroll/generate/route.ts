import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { generatePayslipForEmployee } from "@/lib/payroll";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { resolvePayrollPolicy } from "@/lib/payroll-policy";
import { resolveSalaryRevision } from "@/lib/salary-revisions";

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const month = String(body.month ?? monthKeyIST());
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const scopeKey = locationId ? `location:${locationId}` : "tenant";
  const [tenant, policyRecords, employees, revisions] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    prisma.configurationRecord.findMany({
      where: { tenantId: session.tenantId, kind: "payroll_policy", active: true },
      select: { id: true, locationId: true, version: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...(locationId ? employeeLocationScope(locationId) : {}) },
      select: { id: true, employeeNumber: true, firstName: true, lastName: true, position: true, salary: true, salaryStructure: true, payMode: true, workBasisRate: true, shiftId: true, joiningDate: true, locationId: true, branchId: true, departmentId: true, bankName: true, accountNumber: true, ifscCode: true, pan: true, uan: true, branch: { select: { locationId: true, name: true } }, department: { select: { name: true } }, employmentProfile: { select: { pfAllowed: true, esicAllowed: true, tdsAllowed: true } } },
    }),
    prisma.salaryRevision.findMany({ where: { tenantId: session.tenantId, status: "approved", effectiveFrom: { lte: new Date(`${month}-01T00:00:00.000Z`) } }, select: { id: true, employeeId: true, newSalary: true, effectiveFrom: true } }),
  ]);

  const withSalary = employees
    .filter((e) => e.salary != null && e.salary > 0)
    .map((e) => {
      const revision = resolveSalaryRevision(revisions, e.id, month);
      return ({
      id: e.id,
      salary: revision?.newSalary ?? e.salary!,
      salaryStructure: e.salaryStructure,
      payMode: e.payMode,
      workBasisRate: e.workBasisRate,
      shiftId: e.shiftId,
      joiningDate: e.joiningDate,
       locationId: e.branch?.locationId ?? e.locationId,
       branchId: e.branchId,
       departmentId: e.departmentId,
       employeeNumber: e.employeeNumber,
       firstName: e.firstName,
       lastName: e.lastName,
       position: e.position,
       branchName: e.branch?.name,
       departmentName: e.department?.name,
       pan: e.pan,
       uan: e.uan,
       bankName: e.bankName,
       accountNumber: e.accountNumber,
       ifscCode: e.ifscCode,
       pfAllowed: e.employmentProfile?.pfAllowed,
       esicAllowed: e.employmentProfile?.esicAllowed,
      tdsAllowed: e.employmentProfile?.tdsAllowed,
    });
    });
  const missingSalary = employees.filter((employee) => employee.salary == null || employee.salary <= 0);
  const legacyAcknowledged = body.acknowledgeLegacyPolicy === true;
  const policyFailures = withSalary.filter((employee) => !resolvePayrollPolicy(policyRecords, tenant?.config ?? null, employee.locationId, month).configurationId);
  // A fallback tenant config is legacy behavior, never an invisible operating policy.
  if (policyFailures.length && !legacyAcknowledged) {
    return NextResponse.json({
      error: "No effective published payroll policy exists for this scope and period.",
      preflight: { eligible: withSalary.length, missingSalary: missingSalary.map((employee) => employee.id), missingPolicy: policyFailures.map((employee) => employee.id) },
    }, { status: 409 });
  }
  if (!withSalary.length) return NextResponse.json({ error: "No eligible employees with a salary were found. No payroll run was created.", preflight: { eligible: 0, missingSalary: missingSalary.map((employee) => employee.id) } }, { status: 409 });
  let run;
  try {
    run = await prisma.payrollRun.create({ data: { tenantId: session.tenantId, scopeKey, locationId, month, createdBy: session.sub, ...(legacyAcknowledged && policyFailures.length ? { note: "Legacy policy acknowledged at generation" } : {}) } });
    if (legacyAcknowledged && policyFailures.length) await prisma.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "payroll_run.legacy_policy_acknowledged", entity: "PayrollRun", entityId: run.id, summary: `Legacy policy acknowledged for ${policyFailures.length} employee(s)`, after: { month, employeeIds: policyFailures.map((employee) => employee.id) } } });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") return NextResponse.json({ error: `A payroll run already exists for ${month} in this scope. Review or cancel that run; do not generate a duplicate.` }, { status: 409 });
    throw error;
  }
  let created = 0;
  let totalLoanApplied = 0;

  type GenResult = { employeeId: string; employeeName: string; created: boolean; netSalary?: number; error?: string };
  const results: GenResult[] = [];

  for (const emp of withSalary) {
    try {
      const policySnapshot = resolvePayrollPolicy(policyRecords, tenant?.config ?? null, emp.locationId, month);
       const res = await generatePayslipForEmployee(session.tenantId, tenant?.config ?? null, emp, month, policySnapshot, run.id);
      if (res.created) created++;
      totalLoanApplied += res.loanApplied ?? 0;
        const source = employees.find((candidate) => candidate.id === emp.id);
        results.push({ employeeId: emp.id, employeeName: source ? `${source.firstName} ${source.lastName}`.trim() : emp.id, created: res.created, ...(res.netSalary != null ? { netSalary: res.netSalary } : {}) });
      } catch (e) {
      const source = employees.find((candidate) => candidate.id === emp.id);
      results.push({ employeeId: emp.id, employeeName: source ? `${source.firstName} ${source.lastName}`.trim() : emp.id, created: false, error: e instanceof Error ? e.message : "Failed to generate" });
    }
  }

  const failed = results.filter((r) => r.error).length;
  if (created === 0) {
    // Do not strand an operational draft when generation yielded no documents.
    await prisma.$transaction([
      prisma.payrollRun.update({ where: { id: run.id }, data: { status: "cancelled", cancelledBy: session.sub, cancelledAt: new Date(), note: "Automatically cancelled: generation produced no payslips." } }),
      prisma.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "payroll_run.cancelled", entity: "PayrollRun", entityId: run.id, summary: "Automatically cancelled empty failed payroll generation", after: { failed, skipped: employees.length - withSalary.length } } }),
    ]);
  }
  return NextResponse.json({
    success: true,
    month,
    runId: run.id,
    created,
    skipped: employees.length - withSalary.length,
    loanApplied: totalLoanApplied,
    results,
    totals: { created, skipped: employees.length - withSalary.length, failed, total: employees.length },
    cancelled: created === 0,
  });
}
