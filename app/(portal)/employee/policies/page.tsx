import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmployeePoliciesPage() {
  const session = await requireSession();
  const lang = await getLang();

  const policies = await prisma.policy.findMany({
    where: { tenantId: session.tenantId, active: true },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });

  const byCategory = new Map<string, typeof policies>();
  for (const p of policies) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t(lang, "policies.title")} description={t(lang, "policies.description")} />
      {policies.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title={t(lang, "policies.empty")} description={t(lang, "policies.emptyDesc")} />
      ) : (
        [...byCategory.entries()].map(([cat, items]) => (
          <div key={cat}>
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
            <div className="space-y-3">
              {items.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-5">
                    <p className="text-[14px] font-semibold">{p.title}</p>
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
