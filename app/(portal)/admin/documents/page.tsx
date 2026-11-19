import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DocumentsPanel } from "./documents-panel";
import { expiryStatus } from "@/lib/document-expiry";
import { documentFilters, documentSummary } from "@/lib/document-records";
import { DocumentListFilters } from "@/components/document-list-filters";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination, recordPageRedirect, type RecordSearchParams } from "@/lib/document-expense-pagination";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, params] = await Promise.all([requireActiveSession(), searchParams]);
  const isAdmin = session.role === "admin";
  if (!isAdmin && session.role !== "location_manager") redirect("/employee/documents");
  const locationId = await managerLocationId(session);
  const canAdd = isAdmin || Boolean(locationId);
  const scope = isAdmin ? { tenantId: session.tenantId } : { tenantId: session.tenantId, ...employeeLocationScope(locationId ?? "__unassigned_location__") };
  const baseWhere = { tenantId: session.tenantId, ...(isAdmin ? {} : { employee: scope }) };
  const now = new Date();

  const filters = documentFilters(params, now, true);
  const filtered = Boolean(filters.query || filters.status);
  const where = { AND: [baseWhere, filters.where] };
  const [summary, filteredTotal] = await Promise.all([documentSummary(baseWhere, now), filtered ? prisma.document.count({ where }) : null]);
  const pagination = recordPagination(filteredTotal ?? summary.total, recordPageNumber(params.page) ?? 1);
  const path = "/admin/documents";
  const redirectTo = recordPageRedirect(path, params, pagination);
  if (redirectTo) redirect(redirectTo);

  const [docs, employees] = await Promise.all([
    prisma.document.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
      skip: pagination.offset,
      take: pagination.pageSize,
    }),
    prisma.employee.findMany({
      where: { ...scope, status: "active", loginOnly: false },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <DocumentsPanel
        key={pagination.page}
        documents={docs.map((d) => ({
          id: d.id,
          name: d.name,
          docType: d.docType,
          number: d.number,
          expiryDate: d.expiryDate?.toISOString() ?? null,
          issuedDate: d.issuedDate?.toISOString() ?? null,
          updatedAt: d.updatedAt.toISOString(),
          notes: d.notes,
          hasAttachment: Boolean(d.fileUrl),
          employee: d.employee,
          status: expiryStatus(d.expiryDate, now),
        }))}
        employees={employees}
        summary={summary}
        canAdd={canAdd}
        canDelete={isAdmin}
        filtered={filtered}
        filters={<DocumentListFilters path={path} query={filters.query} status={filters.status} searchEmployees />}
      />
      <DocumentExpensePagination path={path} params={params} pagination={pagination} label="documents" />
    </div>
  );
}
