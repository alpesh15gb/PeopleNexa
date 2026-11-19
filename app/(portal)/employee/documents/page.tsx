import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { FileText, AlertTriangle } from "lucide-react";
import { expiryStatus } from "@/lib/document-expiry";
import { formatDate } from "@/lib/dates";
import { documentFilters, documentSummary } from "@/lib/document-records";
import { DocumentListFilters } from "@/components/document-list-filters";
import { redirect } from "next/navigation";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination, recordPageRedirect, type RecordSearchParams } from "@/lib/document-expense-pagination";

export const dynamic = "force-dynamic";

export default async function EmployeeDocumentsPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, lang, params] = await Promise.all([requireSession(), getLang(), searchParams]);
  const now = new Date();
  const baseWhere = { tenantId: session.tenantId, employeeId: session.sub };
  const filters = documentFilters(params, now);
  const filtered = Boolean(filters.query || filters.status);
  const where = { AND: [baseWhere, filters.where] };
  const [summary, filteredTotal] = await Promise.all([documentSummary(baseWhere, now), filtered ? prisma.document.count({ where }) : null]);
  const path = "/employee/documents";
  const pagination = recordPagination(filteredTotal ?? summary.total, recordPageNumber(params.page) ?? 1);
  const redirectTo = recordPageRedirect(path, params, pagination);
  if (redirectTo) redirect(redirectTo);

  const docs = await prisma.document.findMany({
    where,
    select: { id: true, name: true, docType: true, expiryDate: true, fileUrl: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
  });

  const records = docs.map(({ fileUrl, ...doc }) => ({ ...doc, hasAttachment: Boolean(fileUrl), status: expiryStatus(doc.expiryDate, now) }));
  const alerts = [summary.expired > 0 ? `${summary.expired} expired` : null, summary.expiring > 0 ? `${summary.expiring} expiring within 60 days` : null].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader title={t(lang, "documents.title")} description={t(lang, "documents.description")} />

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[13px] text-warning">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {alerts.join(" · ")}
        </div>
      )}
      {(summary.total > 0 || filtered) && <DocumentListFilters path={path} query={filters.query} status={filters.status} />}

      <Card>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <EmptyState icon={<FileText className="h-5 w-5" />} title={filtered ? "No matching documents" : t(lang, "documents.empty")} description={filtered ? "Try a different file name or expiry status." : t(lang, "documents.emptyDesc")} />
          ) : (
            <div className="divide-y divide-[color:var(--border)]">
              {records.map((d) => {
                const st = d.status;
                return (
                  <div key={d.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-5 py-4 sm:flex">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint text-[11px] font-bold text-muted-foreground">
                      {d.docType.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13.5px] font-medium">{d.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{d.docType}{d.expiryDate ? ` · expires ${formatDate(d.expiryDate)}` : ""}</p>
                    </div>
                    <div className="col-start-2 flex flex-wrap items-center gap-3">
                      <Badge tone={st === "expired" ? "danger" : st === "expiring" ? "warning" : st === "none" ? "neutral" : "success"} className="capitalize">{st === "none" ? "No expiration" : st === "ok" ? "Current" : st}</Badge>
                      {d.hasAttachment && <a href={`/api/documents/${d.id}/attachment`} target="_blank" rel="noreferrer" aria-label={`Open attachment for ${d.name} in a new tab`} className="text-sm font-medium text-primary hover:underline">Open attachment</a>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <DocumentExpensePagination path={path} params={params} pagination={pagination} label="documents" />
    </div>
  );
}
