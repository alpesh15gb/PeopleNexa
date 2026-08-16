import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PerformancePanel } from "./performance-panel";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");

  const [kpis, reviews, employees] = await Promise.all([
    prisma.kpi.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.performanceReview.findMany({
      where: { tenantId: session.tenantId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } },
        reviewer: { select: { firstName: true, lastName: true } },
        scores: { include: { kpi: { select: { id: true, name: true } } } },
        feedbacks: { include: { rater: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <PerformancePanel
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
        feedbacks: r.feedbacks.map((f) => ({ id: f.id, rater: `${f.rater.firstName} ${f.rater.lastName}`, comment: f.comment, rating: f.rating, createdAt: f.createdAt.toISOString() })),
      }))}
    />
  );
}
