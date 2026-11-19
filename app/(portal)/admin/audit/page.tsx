import { enrichAuditEntries, auditTime } from "@/lib/audit-display";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/stat";
import { AuditFilter } from "./audit-filter";
import { auditFilters, auditLogPage, auditRangeInvalid } from "@/lib/audit-log-query";
import { recordPageNumber, recordPagination } from "@/lib/document-expense-pagination";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { workspaceRegion } from "@/lib/workspace-region";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; q?: string; from?: string; to?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return (
      <div className="animate-fade-up space-y-6">
        <PageHeader
          title="Audit Log"
          description="Sensitive changes across employees, attendance, leaves, payroll and exits"
        />
        <Card>
          <CardContent>
            <EmptyState
              title="Access denied"
              description="Only admins can view the audit log."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const filters = auditFilters(params);
  const invalid = auditRangeInvalid(filters);
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const region = workspaceRegion(tenant?.config);
  const { rows, pagination } = invalid ? { rows: [], pagination: recordPagination(0, 1) } : await auditLogPage(session.tenantId, filters, recordPageNumber(params.page) ?? 1, 50, region.timeZone);

  const entries = await enrichAuditEntries(rows, session.tenantId);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Audit Log"
        description="Sensitive changes across employees, attendance, leaves, payroll and exits"
      />
      <AuditFilter {...filters} />
      {invalid && <p role="alert" className="text-sm text-destructive">Enter a valid date range with the first date on or before the last date.</p>}
      <Card>
        <CardContent className="p-0 pt-0">
          {entries.length === 0 ? (
            <EmptyState
              title="No audit entries"
              description={
                filters.action || filters.entity || filters.q || filters.from || filters.to
                  ? "Try clearing the filters."
                  : "Sensitive changes will appear here."
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Time ({region.timeZone})</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Employee / Entity</TH>
                  <TH>Summary</TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-[12.5px] text-muted-foreground">
                      <time dateTime={e.createdAt.toISOString()}>{auditTime(e.createdAt, region)}</time>
                    </TD>
                    <TD className="text-[13px]">
                      {e.actorLabel}
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{e.actorRoleLabel}</span>
                    </TD>
                    <TD className="whitespace-nowrap text-[13px]">{e.actionLabel}</TD>
                    <TD className="whitespace-nowrap text-[13px]">{e.employeeLabel ?? e.entity}</TD>
                    <TD className="min-w-64 max-w-xl whitespace-normal text-[13px] text-muted-foreground">
                      {e.readableSummary}
                      {e.changes.map(change => <div key={change} className="mt-1 text-xs">{change}</div>)}
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer">Audit references</summary>
                        <div className="break-all">Audit ID: {e.id}<br />{e.entity} ID: {e.entityId}<br />Actor ID: {e.actorId}<br />Action: {e.action}<br />Original summary: {e.summary || "-"}</div>
                      </details>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <DocumentExpensePagination path="/admin/audit" params={Object.fromEntries(Object.entries(filters).filter(([, value]) => value))} pagination={pagination} label="audit entries" />
    </div>
  );
}
