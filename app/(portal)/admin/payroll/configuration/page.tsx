import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getPayrollConfig } from "@/lib/payroll";
import { payrollPolicyEditorBaseline } from "@/lib/payroll-policy-editor";
import { PayrollConfigurationHub } from "./payroll-configuration-hub";

export const dynamic = "force-dynamic";

export default async function PayrollConfigurationPage() {
  const session = await requireSession();
  if (session.role !== "admin") return null;
  const [tenant, locations, records] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: session.tenantId },
      select: {
        name: true,
        email: true,
        phone: true,
        address: true,
        config: true,
        profile: { select: { legalName: true, displayName: true, address: true, contactEmail: true, contactPhone: true, taxId: true, registrationNo: true } },
      },
    }),
    prisma.location.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        profile: { select: { legalName: true, displayName: true, address: true, contactEmail: true, contactPhone: true, taxId: true, registrationNo: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.configurationRecord.findMany({
      where: { tenantId: session.tenantId, kind: "payroll_policy" },
      include: { location: { select: { name: true } } },
      orderBy: [{ scopeKey: "asc" }, { version: "desc" }],
    }),
  ]);
  return (
    <PayrollConfigurationHub
      locations={locations}
      records={records.map((record) => ({
        ...record,
        effectiveFrom: record.effectiveFrom.toISOString(),
        effectiveTo: record.effectiveTo?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        activatedAt: record.activatedAt?.toISOString() ?? null,
      }))}
      baseline={payrollPolicyEditorBaseline(getPayrollConfig(tenant.config))}
      organization={{
        name: tenant.profile?.legalName ?? tenant.profile?.displayName ?? tenant.name,
        address: tenant.profile?.address ?? tenant.address,
        email: tenant.profile?.contactEmail ?? tenant.email,
        phone: tenant.profile?.contactPhone ?? tenant.phone,
        taxId: tenant.profile?.taxId ?? null,
        registrationNo: tenant.profile?.registrationNo ?? null,
      }}
    />
  );
}
