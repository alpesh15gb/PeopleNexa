import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay } from "@/lib/dates";
import { PLANS } from "@/lib/modules";

export async function GET() {
  try {
    await requireSuperAdmin();

    const [tenants, employees, byPlan, active, suspended, expiring, trials, planRows] = await Promise.all([
      prisma.tenant.count(),
      prisma.employee.count(),
      prisma.tenant.groupBy({ by: ["plan"], _count: true }),
      prisma.tenant.count({ where: { status: "active" } }),
      prisma.tenant.count({ where: { status: "suspended" } }),
      prisma.tenant.count({
        where: { subscriptionExpiry: { gte: new Date(), lt: addDays(startOfDay(new Date()), 30) } },
      }),
      prisma.tenant.count({ where: { plan: "trial" } }),
      prisma.tenant.groupBy({ by: ["plan"], _sum: { seats: true } }),
    ]);

    // Revenue estimates: licensed seats × plan price (trial & enterprise = custom/₹0).
    const byPlanRevenue: Record<string, { count: number; seats: number; mrr: number; arr: number }> = {};
    let mrr = 0;
    let arr = 0;
    for (const p of PLANS) {
      const row = planRows.find((r) => r.plan === p.key);
      const count = byPlan.find((r) => r.plan === p.key)?._count ?? 0;
      const seats = row?._sum.seats ?? 0;
      const planMrr = count > 0 ? seats * p.pricePerSeat : 0;
      const planArr = count > 0 ? seats * p.annualPricePerSeat * 12 : 0;
      byPlanRevenue[p.key] = { count, seats, mrr: planMrr, arr: planArr };
      mrr += planMrr;
      arr += planArr;
    }

    return NextResponse.json({
      tenants,
      employees,
      active,
      suspended,
      expiring,
      trials,
      mrr,
      arr,
      byPlan: Object.fromEntries(byPlan.map((r) => [r.plan, r._count])),
      byPlanRevenue,
      plans: PLANS.map((p) => ({
        key: p.key,
        label: p.label,
        seats: p.seats,
        pricePerSeat: p.pricePerSeat,
        annualPricePerSeat: p.annualPricePerSeat,
        trialDays: p.trialDays,
        modules: p.modules.length,
      })),
    });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to load stats.";
    const status = message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
