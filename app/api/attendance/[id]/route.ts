import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { istDateKey } from "@/lib/ist";

const ALLOWED = ["present", "late", "permission", "absent", "half_day"];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const record = await prisma.attendance.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ record });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (body.punchInTime !== undefined || body.punchOutTime !== undefined) {
    return NextResponse.json(
      { error: "Punch times must be changed through the punch correction flow." },
      { status: 400 }
    );
  }

  const record = await prisma.attendance.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });

  // A paid payslip locks the month: edits must go through payroll regeneration.
  const month = istDateKey(record.date).slice(0, 7);
  const paidSlip = await prisma.payslip.findFirst({
    where: { employeeId: record.employeeId, month, status: "paid" },
  });
  if (paidSlip) {
    return NextResponse.json(
      { error: `A paid payslip already exists for ${month}. Regenerate payroll for that month to pick up attendance changes.` },
      { status: 403 }
    );
  }

  const data: Record<string, unknown> = {};
  if (body.status) {
    if (!ALLOWED.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
    data.finalized = true;
    data.reviewStatus = "manual_override";
  }
  if (body.note !== undefined) data.note = body.note ? String(body.note).trim() : null;

  const updated = await prisma.attendance.update({ where: { id }, data });
  return NextResponse.json({ record: updated });
}
