import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { automaticShiftPolicy, AUTOMATIC_SHIFT_KIND } from "@/lib/automatic-shifts";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const branch = await prisma.branch.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!branch) return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  const policy = automaticShiftPolicy(await req.json().catch(() => null));
  if (!policy) return NextResponse.json({ error: "Select at least two shifts when enabled. Windows must be whole minutes from 0 to 720." }, { status: 400 });
  const count = await prisma.shift.count({ where: { tenantId: session.tenantId, id: { in: policy.shiftIds } } });
  if (count !== policy.shiftIds.length) return NextResponse.json({ error: "Selected shifts must belong to this workspace." }, { status: 400 });
  const now = new Date();
  await prisma.configurationRecord.upsert({ where: { tenantId_scopeKey_kind_version: { tenantId: session.tenantId, scopeKey: `branch:${id}`, kind: AUTOMATIC_SHIFT_KIND, version: 1 } }, create: { tenantId: session.tenantId, scopeKey: `branch:${id}`, kind: AUTOMATIC_SHIFT_KIND, version: 1, effectiveFrom: now, active: true, payload: policy, createdBy: session.sub, activatedBy: session.sub, activatedAt: now }, update: { active: true, payload: policy, activatedBy: session.sub, activatedAt: now } });
  return NextResponse.json({ policy });
}
