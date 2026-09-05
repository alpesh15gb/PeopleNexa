import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** PATCH — review actions: self-score, manager score/complete, 360 feedback. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const review = await prisma.performanceReview.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { scores: true },
  });
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  if (action === "self") {
    if (review.employeeId !== session.sub) {
      return NextResponse.json({ error: "You can only self-score your own review." }, { status: 403 });
    }
    if (review.status !== "draft") {
      return NextResponse.json({ error: "This review was already submitted." }, { status: 400 });
    }
    const scores = (body.scores ?? {}) as Record<string, number>;
    await prisma.$transaction(
      review.scores.map((s) => {
        const v = scores[s.kpiId];
        return prisma.reviewScore.update({
          where: { id: s.id },
          data: { selfScore: Number.isInteger(v) ? Math.max(1, Math.min(5, v as number)) : null },
        });
      })
    );
    const updated = await prisma.performanceReview.update({
      where: { id },
      data: { status: "self_done", selfSummary: body.selfSummary ? String(body.selfSummary).trim() : null },
    });
    return NextResponse.json({ review: updated });
  }

  if (action === "manager") {
    if (session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    if (review.status === "completed") {
      return NextResponse.json({ error: "This review is already completed." }, { status: 400 });
    }
    const scores = (body.scores ?? {}) as Record<string, { score?: number; comment?: string }>;
    await prisma.$transaction(
      review.scores.map((s) => {
        const v = scores[s.kpiId];
        const sc = v?.score;
        return prisma.reviewScore.update({
          where: { id: s.id },
          data: {
            managerScore: Number.isInteger(sc) ? Math.max(1, Math.min(5, sc as number)) : null,
            managerComment: v?.comment ? String(v.comment).trim() : null,
          },
        });
      })
    );
    const updated = await prisma.performanceReview.update({
      where: { id },
      data: {
        status: "completed",
        reviewerId: session.sub,
        managerSummary: body.managerSummary ? String(body.managerSummary).trim() : null,
        overallRating: Number.isInteger(body.overallRating) ? Math.max(1, Math.min(5, body.overallRating)) : null,
      },
    });
    return NextResponse.json({ review: updated });
  }

  if (action === "feedback") {
    if (review.employeeId === session.sub) {
      return NextResponse.json({ error: "You can't give feedback on your own review." }, { status: 400 });
    }
    const comment = String(body.comment ?? "").trim();
    if (!comment) return NextResponse.json({ error: "Feedback comment is required." }, { status: 400 });
    const feedback = await prisma.reviewFeedback.create({
      data: {
        reviewId: id,
        raterId: session.sub,
        comment,
        rating: Number.isInteger(body.rating) ? Math.max(1, Math.min(5, body.rating)) : null,
      },
    });
    return NextResponse.json({ feedback }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** DELETE — admin removes a review cycle. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.performanceReview.deleteMany({ where: { id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
