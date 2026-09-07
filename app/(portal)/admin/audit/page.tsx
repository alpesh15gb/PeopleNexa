import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";
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

  const actorIds = [...new Set(rows.map((r) => r.actorId))];
  const actors =
    actorIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
  const nameById = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
  const entries = rows.map((r) => ({ ...r, actorName: nameById.get(r.actorId) ?? null }));

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
                  <TH>Time</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Summary</TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-[12.5px] text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </TD>
                    <TD className="text-[13px]">
                      {e.actorName ?? e.actorId}
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{e.actorRole}</span>
                    </TD>
                    <TD className="whitespace-nowrap text-[13px]">{e.action}</TD>
                    <TD className="whitespace-nowrap text-[13px]">{e.entity}</TD>
                    <TD className="max-w-md truncate text-[13px] text-muted-foreground">{e.summary || "—"}</TD>
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
