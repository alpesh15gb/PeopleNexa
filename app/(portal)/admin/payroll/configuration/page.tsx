import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { PayrollConfigurationHub } from "./payroll-configuration-hub";

export const dynamic = "force-dynamic";

export default async function PayrollConfigurationPage() {
  const session = await requireSession();
  if (session.role !== "admin") return null;
  const [locations, records] = await Promise.all([
    prisma.location.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "payroll_policy" }, include: { location: { select: { name: true } } }, orderBy: [{ scopeKey: "asc" }, { version: "desc" }] }),
  ]);
  return <div className="animate-fade-up space-y-6"><PageHeader title="Payroll configuration" description="Versioned operating rules for future draft runs. Finalized and paid payroll snapshots are never changed." /><PayrollConfigurationHub locations={locations} records={records} /></div>;
}
