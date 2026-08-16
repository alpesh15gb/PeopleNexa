import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** GET — KPIs + reviews (role-aware). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [kpis, reviews] = await Promise.all([
    prisma.kpi.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.performanceReview.findMany({
      where: session.role === "admin" ? { tenantId: session.tenantId } : { employeeId: session.sub },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } },
        reviewer: { select: { firstName: true, lastName: true } },
        scores: { include: { kpi: { select: { id: true, name: true } } } },
        feedbacks: { include: { rater: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // For employees: reviews of OTHERS open for 360° feedback (self-submitted, not completed).
  const peerReviews =
    session.role === "employee"
      ? await prisma.performanceReview.findMany({
          where: { tenantId: session.tenantId, employeeId: { not: session.sub }, status: { in: ["self_done", "completed"] } },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } },
            feedbacks: { include: { rater: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];

  return NextResponse.json({
    kpis: kpis.map((k) => ({ ...k, createdAt: k.createdAt.toISOString() })),
    peerReviews: peerReviews.map((r) => ({
      id: r.id,
      period: r.period,
      status: r.status,
      employee: r.employee,
      feedbacks: r.feedbacks.map((f) => ({ id: f.id, rater: `${f.rater.firstName} ${f.rater.lastName}`, comment: f.comment, rating: f.rating })),
    })),
    reviews: reviews.map((r) => ({
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
      scores: r.scores.map((s) => ({ id: s.id, kpi: s.kpi.name, selfScore: s.selfScore, managerScore: s.managerScore, managerComment: s.managerComment })),
      feedbacks: r.feedbacks.map((f) => ({ id: f.id, rater: `${f.rater.firstName} ${f.rater.lastName}`, comment: f.comment, rating: f.rating, createdAt: f.createdAt.toISOString() })),
    })),
  });
}

/** POST — admin creates a KPI or a review cycle. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const type = body.type;

  if (type === "kpi") {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "KPI name is required." }, { status: 400 });
    const kpi = await prisma.kpi.create({
      data: {
        tenantId: session.tenantId,
        name,
        description: body.description ? String(body.description).trim() : null,
        category: String(body.category ?? "core"),
      },
    });
    return NextResponse.json({ kpi }, { status: 201 });
  }

  if (type === "review") {
    const employeeId = String(body.employeeId ?? "");
    const period = String(body.period ?? "").trim();
    if (!employeeId || !period) {
      return NextResponse.json({ error: "Employee and period are required." }, { status: 400 });
    }
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: session.tenantId } });
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    const kpis = await prisma.kpi.findMany({ where: { tenantId: session.tenantId, enabled: true } });
    if (kpis.length === 0) {
      return NextResponse.json({ error: "Create at least one KPI first." }, { status: 400 });
    }

    const review = await prisma.performanceReview.create({
      data: {
        tenantId: session.tenantId,
        employeeId,
        reviewerId: session.sub,
        period,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        scores: { create: kpis.map((k) => ({ kpiId: k.id })) },
      },
      include: { scores: true },
    });
    return NextResponse.json({ review }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown type." }, { status: 400 });
}
