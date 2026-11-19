import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import type { Prisma } from "@/generated/prisma/client";

/** PATCH — review actions: self-score, manager score/complete, 360 feedback. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const locationId = action === "self" ? null : await managerLocationId(session);
  if (action !== "self" && session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });

  const where = { id, tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) };
  const review = await prisma.performanceReview.findFirst({
    where,
    include: { scores: true },
  });
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  if (action === "self" || action === "manager") {
    if (action === "self" && review.employeeId !== session.sub) {
      return NextResponse.json({ error: "You can only self-score your own review." }, { status: 403 });
    }
    if (action === "manager" && session.role !== "admin" && session.role !== "location_manager") {
      return NextResponse.json({ error: "You cannot complete this review." }, { status: 403 });
    }
    if (action === "manager" && review.employeeId === session.sub) {
      return NextResponse.json({ error: "Ask another authorized reviewer to complete your review." }, { status: 403 });
    }
    if (action === "self" ? review.status !== "draft" : review.status === "completed") {
      return NextResponse.json({ error: "This review was already submitted." }, { status: 409 });
    }

    const scores = body.scores ?? {};
    const rating = (value: unknown) => typeof value === "number" && Number.isInteger(value) ? Math.max(1, Math.min(5, value)) : null;
    const change: Prisma.PerformanceReviewUncheckedUpdateManyInput = action === "self"
      ? { status: "self_done", selfSummary: body.selfSummary ? String(body.selfSummary).trim() : null }
      : {
          status: "completed",
          reviewerId: session.sub,
          managerSummary: body.managerSummary ? String(body.managerSummary).trim() : null,
          overallRating: rating(body.overallRating),
        };
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.performanceReview.updateMany({ where: { ...where, status: review.status }, data: change });
      if (!claimed.count) return null;
      for (const score of review.scores) {
        const input = scores[score.kpiId];
        await tx.reviewScore.update({
          where: { id: score.id },
          data: action === "self"
            ? { selfScore: rating(input) }
            : { managerScore: rating(input?.score), managerComment: input?.comment ? String(input.comment).trim() : null },
        });
      }
      return tx.performanceReview.findUniqueOrThrow({ where: { id } });
    });
    return updated
      ? NextResponse.json({ review: updated })
      : NextResponse.json({ error: "The review changed. Refresh and try again." }, { status: 409 });
  }

  if (action === "feedback") {
    if (review.employeeId === session.sub) {
      return NextResponse.json({ error: "You can't give feedback on your own review." }, { status: 400 });
    }
    if (review.status !== "self_done") {
      return NextResponse.json({ error: "This review is closed to peer feedback." }, { status: 409 });
    }
    const comment = String(body.comment ?? "").trim();
    if (!comment || comment.length > 10000) return NextResponse.json({ error: "Enter feedback up to 10,000 characters." }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      // Serialize feedback with completion and with other submissions on this review.
      const [open] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "PerformanceReview"
        WHERE id = ${id} AND "tenantId" = ${session.tenantId} AND status = 'self_done'
        FOR UPDATE
      `;
      if (!open) return { error: "This review is closed to peer feedback." };
      const submitted = await tx.reviewFeedback.findFirst({ where: { reviewId: id, raterId: session.sub }, select: { id: true } });
      if (submitted) return { error: "You already submitted feedback for this review." };
      const feedback = await tx.reviewFeedback.create({
        data: {
          reviewId: id,
          raterId: session.sub,
          comment,
          rating: Number.isInteger(body.rating) ? Math.max(1, Math.min(5, body.rating)) : null,
        },
      });
      return { feedback };
    });
    return result.feedback
      ? NextResponse.json({ feedback: result.feedback }, { status: 201 })
      : NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** DELETE — admin removes a review cycle. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  await prisma.performanceReview.deleteMany({ where: { id, tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) } });
  return NextResponse.json({ success: true });
}
