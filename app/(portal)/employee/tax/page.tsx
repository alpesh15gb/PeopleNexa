import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { fyFromMonth } from "@/lib/payroll";
import { monthKeyIST } from "@/lib/dates";
import { TaxDeclarationPanel } from "./tax-declaration-panel";
import Link from "next/link";
import { getTenantAccess } from "@/lib/modules-server";
import { personalPayslipWhere } from "@/lib/personal-payslips";
import { resolvePayrollPolicy } from "@/lib/payroll-policy";
import { supportsIndiaPayroll, workspaceRegion } from "@/lib/workspace-region";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmployeeTaxPage() {
  const session = await requireSession();
  const month = monthKeyIST();
  const fy = fyFromMonth(month);
  const firstYear = Number(fy.slice(0, 4));
  const [employee, declarations, tax, tenant, access, policies] = await Promise.all([
    prisma.employee.findUnique({ where: { id: session.sub }, select: { salary: true, locationId: true, branchId: true, branch: { select: { locationId: true } } } }),
    prisma.taxDeclaration.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub }, orderBy: { fy: "desc" } }),
    prisma.payslip.aggregate({
      where: { ...personalPayslipWhere(session.tenantId, session.sub, false), month: { gte: `${firstYear}-04`, lt: `${firstYear + 1}-04` } },
      _sum: { tds: true }, _count: true,
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    getTenantAccess(session.tenantId),
    prisma.configurationRecord.findMany({
      where: { tenantId: session.tenantId, kind: "payroll_policy", active: true },
      select: { id: true, locationId: true, version: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true },
    }),
  ]);
  const locationId = employee?.branchId ? employee.branch?.locationId : employee?.locationId;
  const payrollPolicy = supportsIndiaPayroll(workspaceRegion(tenant?.config))
    ? resolvePayrollPolicy(policies, tenant?.config, locationId ?? null, month).appliedRules.payrollConfig.tds
    : null;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Tax & statutory"
        description="Review recorded withholding, submit declared amounts, and track HR review."
        actions={<Link href="/employee/payslips" className="rounded-lg border border-edge bg-card px-3 py-2 text-sm font-medium text-primary hover:bg-tint">My payslips</Link>}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-edge bg-card p-4">
          <h2 className="font-semibold">TDS recorded · {fy}</h2>
          <p className="mt-2 text-lg font-semibold tabular-nums">{tax._count > 0 ? formatMoney(tax._sum.tds ?? 0) : "No released statements yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Only released payslips contribute to the total.</p>
        </section>
        <section className="rounded-xl border border-edge bg-card p-4">
          <h2 className="font-semibold">Payroll tax settings</h2>
          <p className="mt-2 text-sm">{payrollPolicy ? payrollPolicy.enabled ? `Current payroll policy uses the ${payrollPolicy.regime} regime.` : "TDS is disabled in the current payroll policy." : "Ask your payroll team which tax settings apply to your workspace."}</p>
          {access.modules.has("documents") && <Link href="/employee/documents" className="mt-2 inline-block text-sm font-medium text-primary underline">Open shared documents</Link>}
        </section>
      </div>
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-semibold">Investment declaration</h2>
          <TaxDeclarationPanel
            currentFy={fy}
            declarations={declarations.map((d) => ({
              id: d.id,
              fy: d.fy,
              sections: (d.sections ?? {}) as Record<string, number>,
              status: d.status,
              note: d.note,
              updatedAt: d.updatedAt.toISOString(),
            }))}
            monthlySalary={employee?.salary ?? 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}
