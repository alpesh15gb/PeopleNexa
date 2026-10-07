import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { UNASSIGNED_SHIFT_POLICY_KIND } from "@/lib/unassigned-shift-policy";
export async function PUT(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.singlePunchHalfDay !== "boolean") return NextResponse.json({ error: "Single-punch half day must be true or false." }, { status: 400 });
  const now = new Date();
  const payload = { singlePunchHalfDay: body.singlePunchHalfDay };
  await prisma.configurationRecord.upsert({
    where: { tenantId_scopeKey_kind_version: { tenantId: session.tenantId, scopeKey: "tenant", kind: UNASSIGNED_SHIFT_POLICY_KIND, version: 1 } },
    create: { tenantId: session.tenantId, scopeKey: "tenant", kind: UNASSIGNED_SHIFT_POLICY_KIND, version: 1, effectiveFrom: now, active: true, payload, createdBy: session.sub, activatedBy: session.sub, activatedAt: now },
    update: { active: true, payload, activatedBy: session.sub, activatedAt: now },
  });
  return NextResponse.json(payload);
}
