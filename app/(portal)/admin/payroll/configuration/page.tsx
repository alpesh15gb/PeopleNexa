import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { PayrollConfigurationHub } from "./payroll-configuration-hub";
import { PayrollFieldMappingPanel } from "./payroll-field-mapping-panel";

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
  return <SettingsWorkspace eyebrow="Payroll settings" title="Payroll settings" description="Rules, components, payment schedule, field mapping, and reference information for future monthly payroll." tabs={[{ label: "Rules and components", href: "/admin/payroll/configuration" }, { label: "Salary revisions", href: "/admin/payroll/salary-revisions" }, { label: "Variance", href: "/admin/payroll/variance" }]} progress={{ label: "Settings readiness", complete: published ? 2 : 1, total: 2, detail: published ? "Rules are available for future monthly payroll." : "Add and review rules before creating monthly payroll." }}><PayrollFieldMappingPanel locations={locations} payrollRecords={records} leaveRecords={leaveRecords} /><div id="payroll-policy-editor"><PayrollConfigurationHub locations={locations} records={records} /></div></SettingsWorkspace>;
}
