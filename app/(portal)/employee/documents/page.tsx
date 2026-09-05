import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { FileText, AlertTriangle } from "lucide-react";
import { expiryStatus } from "@/app/api/documents/route";
import { toDateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function EmployeeDocumentsPage() {
  const session = await requireSession();
  const lang = await getLang();

  const docs = await prisma.document.findMany({
    where: { employeeId: session.sub },
    orderBy: { createdAt: "desc" },
  });

  const alerts = docs.filter((d) => expiryStatus(d.expiryDate) !== "ok" && expiryStatus(d.expiryDate) !== "none");

  return (
    <div className="space-y-6">
      <PageHeader title={t(lang, "documents.title")} description={t(lang, "documents.description")} />

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {alerts.map((d) => `"${d.name}" ${expiryStatus(d.expiryDate) === "expired" ? "has expired" : `expires ${toDateKey(d.expiryDate!)}`}`).join(" · ")}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <EmptyState icon={<FileText className="h-5 w-5" />} title={t(lang, "documents.empty")} description={t(lang, "documents.emptyDesc")} />
          ) : (
            <div className="divide-y divide-[color:var(--border)]">
              {docs.map((d) => {
                const st = expiryStatus(d.expiryDate);
                return (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint text-[11px] font-bold text-muted-foreground">
                      {d.docType.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{d.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{d.docType}{d.expiryDate ? ` · expires ${toDateKey(d.expiryDate)}` : ""}</p>
                    </div>
                    <Badge tone={st === "expired" ? "danger" : st === "expiring" ? "warning" : "success"} className="capitalize">{st}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
