import { enrichAuditEntries, auditTime } from "@/lib/audit-display";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/stat";
import { AuditFilter } from "./audit-filter";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string }>;
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

  const { action: actionParam, entity: entityParam } = await searchParams;
  const actionFilter = actionParam?.trim() || "";
  const entityFilter = entityParam?.trim() || "";

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: session.tenantId,
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(entityFilter ? { entity: entityFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const entries = await enrichAuditEntries(rows, session.tenantId);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Audit Log"
        description="Sensitive changes across employees, attendance, leaves, payroll and exits"
        actions={<AuditFilter action={actionFilter} entity={entityFilter} />}
      />
      <Card>
        <CardContent className="p-0 pt-0">
          {entries.length === 0 ? (
            <EmptyState
              title="No audit entries"
              description={
                actionFilter || entityFilter
                  ? "Try clearing the filters."
                  : "Sensitive changes will appear here."
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Time (IST)</TH>
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
                      {auditTime(e.createdAt)}
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
    </div>
  );
}
