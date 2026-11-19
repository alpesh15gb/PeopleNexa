import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { optionalDateInput } from "@/lib/dates";

import { recordApiPaging, recordPageNumber, recordPagination } from "@/lib/document-expense-pagination";

/** GET — KPIs + reviews (role-aware). */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const personal = req.nextUrl.searchParams.get("scope") === "self";
  const locationId = personal ? null : await managerLocationId(session);
  if (!personal && session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const params = req.nextUrl.searchParams;
  const paging = recordApiPaging(params, 100);
  const peerPage = recordPageNumber(params.get("peerPage") ?? "1");
  if (!paging || !peerPage || params.getAll("peerPage").length > 1) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  const where = {
    tenantId: session.tenantId,
    ...(locationId ? { employee: employeeLocationScope(locationId) } : !personal && session.role === "admin" ? {} : { employeeId: session.sub }),
  };
  const peerWhere = { tenantId: session.tenantId, employeeId: { not: session.sub }, status: "self_done" };
  const [total, peerTotal] = await Promise.all([
    prisma.performanceReview.count({ where }),
    session.role === "employee" ? prisma.performanceReview.count({ where: peerWhere }) : 0,
  ]);
  const pagination = recordPagination(total, paging.page, paging.pageSize);
  const peerPagination = recordPagination(peerTotal, peerPage, Math.min(50, paging.pageSize));
  const [kpis, reviews] = await Promise.all([
    prisma.kpi.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.performanceReview.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } },
        reviewer: { select: { firstName: true, lastName: true } },
        scores: { include: { kpi: { select: { id: true, name: true } } } },
        feedbacks: { include: { rater: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.pageSize,
      skip: pagination.offset,
    }),
  ]);

  // For employees: reviews of OTHERS open for 360° feedback (self-submitted, not completed).
  const peerReviews =
    session.role === "employee"
      ? await prisma.performanceReview.findMany({
          where: peerWhere,
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } },
            feedbacks: { where: { raterId: session.sub }, include: { rater: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: peerPagination.pageSize,
          skip: peerPagination.offset,
        })
      : [];

  return NextResponse.json({
    pagination,
    peerPagination,
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
      scores: r.scores.map((s) => ({ id: s.id, kpiId: s.kpiId, kpi: s.kpi.name, selfScore: s.selfScore, managerScore: s.managerScore, managerComment: s.managerComment })),
      feedbacks: r.status === "completed" || (r.employeeId !== session.sub && !personal && (session.role === "admin" || session.role === "location_manager"))
        ? r.feedbacks.map((f) => ({ id: f.id, rater: `${f.rater.firstName} ${f.rater.lastName}`, comment: f.comment, rating: f.rating, createdAt: f.createdAt.toISOString() }))
        : [],
    })),
  });
}

/** POST — admin creates a KPI or a review cycle. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const type = body.type;

  if (type === "kpi") {
    if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
    const locationId = await managerLocationId(session);
    if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
    const employeeId = String(body.employeeId ?? "");
    const period = String(body.period ?? "").trim();
    if (!employeeId || !period) {
      return NextResponse.json({ error: "Employee and period are required." }, { status: 400 });
    }
    const dueDate = optionalDateInput(body.dueDate);
    if (dueDate === "invalid") return NextResponse.json({ error: "Enter a valid due date." }, { status: 400 });
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: session.tenantId, status: "active", loginOnly: false, ...(locationId ? employeeLocationScope(locationId) : {}) }, select: { id: true } });
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
        dueDate,
        scores: { create: kpis.map((k) => ({ kpiId: k.id })) },
      },
      include: { scores: true },
    }).catch((error: unknown) => {
      if ((error as { code?: string })?.code === "P2002") return null;
      throw error;
    });
    if (!review) return NextResponse.json({ error: "A review already exists for this employee and period." }, { status: 409 });
    return NextResponse.json({ review }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown type." }, { status: 400 });
}
