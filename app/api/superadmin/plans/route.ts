import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/lib/prisma";
import { PLANS, MODULES } from "@/lib/modules";
import { getEffectivePlans, invalidatePlansCache } from "@/lib/plans-server";

export async function GET() {
  try {
    await requireSuperAdmin();
    const plans = await getEffectivePlans();
    const overrides = await prisma.planOverride.findMany();
    return NextResponse.json({
      plans: plans.map((p) => ({
        ...p,
        customized: overrides.some((o) => o.planKey === p.key),
      })),
    });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to load plans.";
    return NextResponse.json({ error: message }, { status: message === "unauthorized" ? 401 : 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const sa = await requireSuperAdmin();
    const body = await req.json();
    const planKey = String(body.planKey ?? "");
    if (!PLANS.some((p) => p.key === planKey)) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }

    // Validate numeric fields (undefined = keep default; null = reset to default).
    const num = (v: unknown): number | null | undefined => {
      if (v === undefined || v === null || v === "") return v === null || v === "" ? null : undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error("Prices, seats and trial days must be non-negative numbers.");
      return Math.round(n);
    };

    let modules: string[] | null | undefined;
    if (body.modules !== undefined && body.modules !== null) {
      if (!Array.isArray(body.modules)) throw new Error("modules must be a list.");
      const unknown = body.modules.filter((m: unknown) => !MODULES.some((d) => d.key === m));
      if (unknown.length > 0) throw new Error(`Unknown modules: ${unknown.join(", ")}`);
      modules = body.modules.map((m: string) => String(m));
    }

    const label = body.label === undefined || body.label === null || body.label === "" ? null : String(body.label).trim().slice(0, 40);
    const data = {
      label,
      pricePerSeat: num(body.pricePerSeat),
      annualPricePerSeat: num(body.annualPricePerSeat),
      trialDays: num(body.trialDays),
      seats: num(body.seats),
      modules: modules ?? [],
      updatedBy: sa.sub,
    };

    await prisma.planOverride.upsert({
      where: { planKey },
      create: { planKey, ...data },
      update: data,
    });
    invalidatePlansCache();

    return NextResponse.json({ success: true, planKey });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : err instanceof Error ? err.message : "Failed to save plan.";
    return NextResponse.json({ error: message }, { status: message === "unauthorized" ? 401 : 400 });
  }
}
