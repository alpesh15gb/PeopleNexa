import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { LeavesPanel } from "./leaves-panel";

export const dynamic = "force-dynamic";

export default async function EmployeeLeavesPage() {
  const session = await requireSession();
  const lang = await getLang();

  const [types, requests] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub },
      include: { leaveType: true },
      orderBy: { appliedAt: "desc" },
    }),
  ]);

  const usedByType = new Map<string, number>();
  for (const r of requests) {
    if (r.status === "approved" || r.status === "pending") {
      usedByType.set(r.leaveTypeId, (usedByType.get(r.leaveTypeId) ?? 0) + r.days);
    }
  }

  const balance = types.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    maxDays: t.maxDays,
    color: t.color,
    used: usedByType.get(t.id) ?? 0,
    remaining: Math.max(t.maxDays - (usedByType.get(t.id) ?? 0), 0),
  }));

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t(lang, "leaves.title")} description={t(lang, "leaves.desc")} />
      <LeavesPanel balance={balance} requests={requests} lang={lang} />
    </div>
  );
}
