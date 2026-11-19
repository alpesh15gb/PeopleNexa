import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { FileText } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function EmployeePoliciesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const session = await requireSession();
  const [lang, params] = await Promise.all([getLang(), searchParams]);

  const policies = await prisma.policy.findMany({
    where: { tenantId: session.tenantId, active: true },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
  const categories = [...new Set(policies.map(({ category }) => category))];
  const category = categories.find((value) => value === params.category) ?? "";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const byCategory = new Map<string, typeof policies>();
  for (const p of policies) {
    if ((category && p.category !== category) || (query && !`${p.title} ${p.body}`.toLowerCase().includes(query.toLowerCase()))) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t(lang, "policies.title")} description={t(lang, "policies.description")} />
      {(policies.length > 0 || query) && <form action="/employee/policies" className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-card p-3">
        <Input name="q" aria-label="Search my company policies" defaultValue={query} maxLength={100} placeholder="Search title or policy text" className="min-w-36 flex-1" />
        <Select name="category" aria-label="Policy category" defaultValue={category} className="w-auto">
          <option value="">All categories</option>
          {categories.map((value) => <option className="capitalize" key={value} value={value}>{value}</option>)}
        </Select>
        <Button type="submit" variant="outline" size="sm">Find policies</Button>
        {(query || category) && <Link href="/employee/policies" className="px-2 text-sm text-primary hover:underline">Clear filters</Link>}
      </form>}
      {policies.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title={t(lang, "policies.empty")} description={t(lang, "policies.emptyDesc")} />
      ) : byCategory.size === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No matching policies" description="Try a different phrase or category." />
      ) : (
        [...byCategory.entries()].map(([cat, items]) => (
          <div key={cat}>
            <h2 className="mb-2 text-sm font-semibold capitalize">{cat}</h2>
            <div className="space-y-3">
              {items.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-5">
                    <details open={Boolean(query) || items.length === 1}>
                      <summary className="cursor-pointer break-words text-sm font-semibold">{p.title} <span className="ml-2 text-xs font-normal text-muted-foreground">Version {p.version}</span></summary>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                    </details>
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
