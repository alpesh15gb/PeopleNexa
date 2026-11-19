import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PoliciesPanel } from "./policies-panel";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const session = await requireActiveSession();
  if (session.role !== "admin") redirect("/employee/policies");

  const policies = await prisma.policy.findMany({
    where: { tenantId: session.tenantId, active: true },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });

  return (
    <PoliciesPanel
      policies={policies.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        body: p.body,
        version: p.version,
        updatedAt: p.updatedAt.toISOString(),
      }))}
    />
  );
}
