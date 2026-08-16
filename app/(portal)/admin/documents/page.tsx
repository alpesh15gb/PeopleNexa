import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DocumentsPanel } from "./documents-panel";
import { expiryStatus } from "@/app/api/documents/route";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");

  const [docs, employees] = await Promise.all([
    prisma.document.findMany({
      where: { tenantId: session.tenantId },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  const statuses = docs.map((d) => expiryStatus(d.expiryDate));
  const summary = {
    total: docs.length,
    expired: statuses.filter((s) => s === "expired").length,
    expiring: statuses.filter((s) => s === "expiring").length,
  };

  return (
    <DocumentsPanel
      documents={docs.map((d) => ({
        id: d.id,
        name: d.name,
        docType: d.docType,
        number: d.number,
        expiryDate: d.expiryDate?.toISOString() ?? null,
        issuedDate: d.issuedDate?.toISOString() ?? null,
        notes: d.notes,
        employee: d.employee,
        status: expiryStatus(d.expiryDate),
      }))}
      employees={employees.map((e) => ({ ...e }))}
      summary={summary}
    />
  );
}
