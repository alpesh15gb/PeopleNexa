import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { reprocessFailedRealtimeLogs } from "@/lib/realtime-devices";

// POST { codes: string[] } — create inactive identities, then reprocess flags.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { codes?: unknown };
  const codes = [
    ...new Set(
      (Array.isArray(body.codes) ? (body.codes as unknown[]) : [])
        .map((v) => String(v))
        .map((s: string) => s.trim())
        .filter((s: string) => Boolean(s))
    ),
  ].slice(0, 500) as string[];
  if (codes.length === 0) return NextResponse.json({ error: "codes[] is required" }, { status: 400 });

  // Per-row identities need individual random credentials, so a single
  // createMany is not trivially convertible — keep the loop with per-row
  // try/catch so one bad code never aborts the whole import.
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const code of codes) {
    try {
      const existing = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, employeeNumber: code } });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.employee.create({
        data: {
          tenantId: session.tenantId,
          employeeNumber: code,
          firstName: code,
          lastName: "",
          email: `${code.toLowerCase().replace(/[^a-z0-9]/g, "")}@device.local`,
          password: await hashPassword(crypto.randomBytes(32).toString("hex")),
          role: "employee",
          status: "inactive",
        },
      });
      created++;
    } catch {
      failed++;
    }
  }
  const reprocessed = (await reprocessFailedRealtimeLogs(session.tenantId)).accepted;
  return NextResponse.json({ success: true, created, skipped, failed, reprocessed });
}
