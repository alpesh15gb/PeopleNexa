import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { ArrowLeft, FileText, AlertTriangle, BookOpen, Package } from "lucide-react";
import { expiryStatus } from "@/lib/document-expiry";
import { formatDate } from "@/lib/dates";
import { documentFilters, documentSummary } from "@/lib/document-records";
import { DocumentListFilters } from "@/components/document-list-filters";
import { redirect } from "next/navigation";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination, recordPageRedirect, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { getTenantAccess } from "@/lib/modules-server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmployeeDocumentsPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, lang, params] = await Promise.all([requireSession(), getLang(), searchParams]);
  const { modules } = await getTenantAccess(session.tenantId);
  const path = "/employee/documents";
  const tabs = [
    { id: "files", label: "My files" },
    ...(modules.has("policies") ? [{ id: "policies", label: "Company policies" }] : []),
    ...(modules.has("assets") ? [{ id: "assets", label: "Assigned assets" }] : []),
  ];
  const view = tabs.find((tab) => tab.id === params.view)?.id ?? "files";
  const fromOnboarding = params.from === "onboarding" && modules.has("onboarding");
  const context: Record<string, string> = fromOnboarding ? { from: "onboarding" } : {};
  const nav = <nav aria-label="Document center" className="flex flex-wrap gap-2 border-b border-edge pb-2">{tabs.map((tab) => {
    const query = new URLSearchParams(context);
    if (tab.id !== "files") query.set("view", tab.id);
    return <Link key={tab.id} href={query.size ? `${path}?${query}` : path} aria-current={view === tab.id ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium ${view === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-tint"}`}>{tab.label}</Link>;
  })}</nav>;
  const heading = <>
    {fromOnboarding && <Link href="/employee/onboarding" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden="true" /> Back to my checklist</Link>}
    <PageHeader title="Document center" description="Open employee files shared by HR and access available workplace records." />
  </>;
  if (view === "policies") {
    const policies = await prisma.policy.findMany({ where: { tenantId: session.tenantId, active: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 6, select: { id: true, title: true, category: true, version: true } });
    return <div className="space-y-5">{heading}{nav}
      <Card><CardHeader className="flex-wrap"><CardTitle>Recently published policies</CardTitle>{policies.length > 0 && <Link href="/employee/policies" className="text-sm font-medium text-primary hover:underline">Browse all policies</Link>}</CardHeader><CardContent>
        {policies.length ? <ul className="divide-y divide-edge">{policies.map((policy) => <li key={policy.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium">{policy.title}</p><p className="text-xs capitalize text-muted-foreground">{policy.category} · Version {policy.version}</p></div><Link href={`/employee/policies?q=${encodeURIComponent(policy.title)}`} className="text-sm font-medium text-primary hover:underline">Read policy</Link></li>)}</ul> : <EmptyState icon={<BookOpen className="size-5" />} title="No published policies" description="Company policies will appear when HR publishes them." />}
      </CardContent></Card>
    </div>;
  }
  if (view === "assets") {
    const assignments = await prisma.assetAssignment.findMany({ where: { employeeId: session.sub, returnedAt: null, asset: { tenantId: session.tenantId } }, select: { id: true, assignedAt: true, asset: { select: { name: true, tag: true, category: true } } }, orderBy: [{ assignedAt: "desc" }, { id: "desc" }] });
    return <div className="space-y-5">{heading}{nav}
      <Card><CardHeader><CardTitle>My issued equipment</CardTitle></CardHeader><CardContent>
        {assignments.length ? <ul className="divide-y divide-edge">{assignments.map((assignment) => <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium">{assignment.asset.name}</p><p className="text-xs text-muted-foreground">{assignment.asset.tag} · {assignment.asset.category.replace(/_/g, " ")}</p></div><span className="text-xs text-muted-foreground">Assigned {formatDate(assignment.assignedAt)}</span></li>)}</ul> : <EmptyState icon={<Package className="size-5" />} title="No equipment assigned" description="Equipment recorded as issued to you will appear here." />}
      </CardContent></Card>
    </div>;
  }
  const now = new Date();
  const baseWhere = { tenantId: session.tenantId, employeeId: session.sub };
  const filters = documentFilters(params, now);
  const filtered = Boolean(filters.query || filters.status);
  const where = { AND: [baseWhere, filters.where] };
  const [summary, filteredTotal] = await Promise.all([documentSummary(baseWhere, now), filtered ? prisma.document.count({ where }) : null]);
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
      {heading}
      {nav}

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[13px] text-warning">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {alerts.join(" · ")}
        </div>
      )}
      {(summary.total > 0 || filtered) && <DocumentListFilters path={path} query={filters.query} status={filters.status} context={context} />}

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
      <p className="text-sm text-muted-foreground">To submit a new file or request a correction, ask HR for the submission process. {modules.has("helpdesk") && <Link href="/employee/helpdesk?action=new" className="font-medium text-primary hover:underline">Contact HR</Link>}</p>
    </div>
  );
}
