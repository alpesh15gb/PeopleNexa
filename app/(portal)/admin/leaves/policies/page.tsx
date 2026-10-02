import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LeavePolicyWorkspace } from "./policy-workspace";

export const dynamic = "force-dynamic";

export default async function LeavePoliciesPage() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/admin/leaves");
  const [locations, types, records, periods] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveType.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    }),
    prisma.configurationRecord.findMany({
      where: { tenantId: session.tenantId, kind: "leave_policy" },
      orderBy: { version: "desc" },
    }),
    prisma.leavePolicyPeriod.findMany({
      where: { tenantId: session.tenantId },
      select: { configurationId: true, _count: { select: { balances: true } } },
    }),
  ]);
  return (
    <LeavePolicyWorkspace
      locations={locations}
      types={types}
      records={records.map((record) => ({
        ...record,
        effectiveFrom: record.effectiveFrom.toISOString(),
        effectiveTo: record.effectiveTo?.toISOString() ?? null,
        activatedAt: record.activatedAt?.toISOString() ?? null,
      }))}
      periods={periods.map((period) => ({
        configurationId: period.configurationId,
        balances: period._count.balances,
      }))}
    />
  );
}
