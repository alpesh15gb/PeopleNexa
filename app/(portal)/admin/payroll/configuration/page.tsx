import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { PayrollConfigurationHub } from "./payroll-configuration-hub";

export const dynamic = "force-dynamic";

export default async function PayrollConfigurationPage() {
  const session = await requireSession();
  if (session.role !== "admin") return null;
  const [locations, records] = await Promise.all([
    prisma.location.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "payroll_policy" }, include: { location: { select: { name: true } } }, orderBy: [{ scopeKey: "asc" }, { version: "desc" }] }),
  ]);
  const published = records.filter((record) => record.active).length;
  return <SettingsWorkspace eyebrow="PeopleNexa payroll" title="Payroll configuration" description="Versioned operating rules for future draft payroll runs. Finalized and paid snapshots never change." tabs={[{ label: "Payroll operations", href: "/admin/payroll" }, { label: "Salary revisions", href: "/admin/payroll/salary-revisions" }]} progress={{ label: "Configuration readiness", complete: published ? 2 : 1, total: 2, detail: published ? "A published policy is available for future draft runs." : "Create and review a version before publishing it for future draft runs." }}><PayrollConfigurationHub locations={locations} records={records} /></SettingsWorkspace>;
}
