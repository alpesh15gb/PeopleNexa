import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PerformancePanel } from "./performance-panel";
import { EmptyState } from "@/components/ui/stat";

import type { Prisma } from "@/generated/prisma/client";
import { recordPageNumber, recordPageRedirect, recordPagination, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";

export const dynamic = "force-dynamic";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const session = await requireActiveSession();
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee/performance");
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) {
    return <EmptyState title="No location assigned" description="Ask your administrator to assign a location before you manage reviews." />;
  }
  const scope = locationId ? employeeLocationScope(locationId) : {};

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" && ["draft", "self_done", "completed"].includes(params.status) ? params.status : "";
  const base = { tenantId: session.tenantId, employee: scope };
  const where: Prisma.PerformanceReviewWhereInput = {
    ...base,
    ...(status ? { status } : {}),
    AND: query.split(/\s+/).filter(Boolean).map((word) => {
      const match = { contains: word, mode: "insensitive" as const };
      return { OR: [{ period: match }, { employee: { firstName: match } }, { employee: { lastName: match } }, { employee: { employeeNumber: match } }] };
    }),
  };
  const [total, pending] = await Promise.all([
    prisma.performanceReview.count({ where }),
    prisma.performanceReview.count({ where: { ...base, status: { not: "completed" } } }),
  ]);
  const pagination = recordPagination(total, recordPageNumber(params.page) ?? 1);
  const canonical = recordPageRedirect("/admin/performance", params, pagination);
  if (canonical) redirect(canonical);
  const [kpis, reviews, employees] = await Promise.all([
    prisma.kpi.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.performanceReview.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } },
        reviewer: { select: { firstName: true, lastName: true } },
        scores: { include: { kpi: { select: { id: true, name: true } } } },
        feedbacks: { include: { rater: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.offset,
      take: pagination.pageSize,
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...scope },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <PerformancePanel
      key={JSON.stringify([query, status, pagination.page])}
      query={query}
      status={status}
      pending={pending}
      pager={<DocumentExpensePagination path="/admin/performance" params={params} pagination={pagination} label="reviews" />}
      canManageKpis={session.role === "admin"}
      actorId={session.sub}
      kpis={kpis.map((k) => ({ id: k.id, name: k.name, description: k.description, category: k.category, enabled: k.enabled }))}
      employees={employees.map((e) => ({ ...e }))}
      reviews={reviews.map((r) => ({
        id: r.id,
        period: r.period,
        status: r.status,
        selfSummary: r.selfSummary,
        managerSummary: r.managerSummary,
        overallRating: r.overallRating,
        dueDate: r.dueDate?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        employee: r.employee,
        reviewer: r.reviewer,
        scores: r.scores.map((s) => ({ id: s.id, kpiId: s.kpiId, kpi: s.kpi.name, selfScore: s.selfScore, managerScore: s.managerScore, managerComment: s.managerComment })),
        feedbacks: r.employeeId === session.sub && r.status !== "completed" ? [] : r.feedbacks.map((f) => ({ id: f.id, rater: `${f.rater.firstName} ${f.rater.lastName}`, comment: f.comment, rating: f.rating, createdAt: f.createdAt.toISOString() })),
      }))}
    />
  );
}
