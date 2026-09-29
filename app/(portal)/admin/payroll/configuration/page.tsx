import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { PayrollConfigurationHub } from "./payroll-configuration-hub";

export const dynamic = "force-dynamic";

export default async function PayrollConfigurationPage() {
  const session = await requireSession();
  if (session.role !== "admin") return null;
  const [locations, records, leaveRecords] = await Promise.all([
    prisma.location.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "payroll_policy" }, include: { location: { select: { name: true } } }, orderBy: [{ scopeKey: "asc" }, { version: "desc" }] }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "leave_policy", active: true }, select: { id: true, version: true, active: true, locationId: true, effectiveFrom: true, effectiveTo: true, payload: true } }),
  ]);
  const published = records.filter((record) => record.active).length;
  return <SettingsWorkspace eyebrow="Payroll policy" title="Payroll policy" description="Rules and components for future monthly payroll. Existing finalized and paid payroll remains unchanged." tabs={[{ label: "Payroll policy", href: "/admin/payroll/configuration" }, { label: "Future pay changes", href: "/admin/payroll/salary-revisions" }, { label: "Payroll history & variance", href: "/admin/payroll/variance" }]} progress={{ label: "Policy readiness", complete: published ? 2 : 1, total: 2, detail: published ? "Rules are available for future monthly payroll." : "Publish effective rules before creating monthly payroll." }}><p className="rounded-xl border border-edge bg-card p-4 text-sm text-muted-foreground">Need export column details? <a className="font-medium text-primary underline" href="#register-field-reference">Open Register field reference</a>.</p><div id="payroll-policy-editor"><PayrollConfigurationHub locations={locations} records={records} /></div><details id="register-field-reference" className="rounded-xl border border-edge bg-card p-4"><summary className="cursor-pointer font-medium">Register field reference</summary><p className="mt-2 text-sm text-muted-foreground">Reference-only mapping is retained for register exports. It does not change payroll calculations or policy values.</p></details></SettingsWorkspace>;
}
