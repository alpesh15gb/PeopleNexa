import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Purge stale punch selfies (DPDP retention: 90 days).
 *
 * - Nulls Punch.selfie where punchTime < now-90d and selfie IS NOT NULL.
 * - Batched (500 ids per round) so large backlogs never blow up a single
 *   updateMany; loops until a round finds nothing.
 * - FaceEnrollment rows / embeddings are untouched; Attendance rows untouched.
 *
 * Trigger: POST with `x-cron-secret` matching CRON_SECRET (scheduler), or a
 * superadmin session for manual runs (mirrors ebioserver-pull).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  const authorizedBySecret = Boolean(secret) && req.headers.get("x-cron-secret") === secret;
  if (!authorizedBySecret) {
    const { requireActiveSession } = await import("@/lib/session");
    const session = await requireActiveSession().catch(() => null);
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - 90 * 86_400_000);
  let purged = 0;
  for (;;) {
    const batch = await prisma.punch.findMany({
      where: { punchTime: { lt: cutoff }, selfie: { not: null } },
      select: { id: true },
      take: 500,
    });
    if (batch.length === 0) break;
    const res = await prisma.punch.updateMany({
      where: { id: { in: batch.map((b) => b.id) } },
      data: { selfie: null },
    });
    purged += res.count;
    if (batch.length < 500) break;
  }

  return NextResponse.json({ purged });
}
