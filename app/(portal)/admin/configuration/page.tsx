import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { ConfigurationManager } from "./configuration-manager";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const session = await requireSession();
  if (session.role !== "admin") throw new Error("unauthorized");
  const [tenant, locations, records] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { name: true, email: true, phone: true, address: true, profile: true } }),
    prisma.location.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, code: true, profile: true }, orderBy: { name: "asc" } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId }, include: { location: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }] }),
  ]);
  return <div className="animate-fade-up space-y-6"><PageHeader title="Configuration" description="Draft company, location, dashboard, ID-card, leave, and payroll configuration without changing current live behavior." /><ConfigurationManager tenant={tenant} locations={locations} records={records} /></div>;
}
