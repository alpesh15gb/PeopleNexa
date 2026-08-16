import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/modules";
import { invalidatePlansCache } from "@/lib/plans-server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireSuperAdmin();
    const { key } = await params;
    if (!PLANS.some((p) => p.key === key)) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }
    await prisma.planOverride.delete({ where: { planKey: key } }).catch(() => null);
    invalidatePlansCache();
    return NextResponse.json({ success: true, planKey: key });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to reset plan.";
    return NextResponse.json({ error: message }, { status: message === "unauthorized" ? 401 : 500 });
  }
}
