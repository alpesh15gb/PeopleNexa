import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPayrollConfig, DEFAULT_PAYROLL_CONFIG, type PayrollConfig } from "@/lib/payroll";

function finiteInRange(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const n = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  return NextResponse.json({ config: getPayrollConfig(tenant?.config ?? null) });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
    if (!tenant) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    const current = getPayrollConfig(tenant.config ?? null);

    const state = String(body.pt?.state ?? current.pt.state).trim();
    if (!state || state.length > 80) throw new Error("Professional-tax state is invalid.");

    const next: PayrollConfig = {
      basicPercent: finiteInRange(body.basicPercent, current.basicPercent, 0, 100, "Basic percentage"),
      allowancesPercent: finiteInRange(body.allowancesPercent, current.allowancesPercent, 0, 100, "Allowance percentage"),
      lateFinePerLateDay: finiteInRange(body.lateFinePerLateDay, current.lateFinePerLateDay, 0, 100000, "Late fine"),
      otMultiplier: finiteInRange(body.otMultiplier, current.otMultiplier, 0, 5, "OT multiplier"),
      deductAbsentDays: body.deductAbsentDays !== undefined ? Boolean(body.deductAbsentDays) : current.deductAbsentDays,
      pf: {
        enabled: body.pf?.enabled !== undefined ? Boolean(body.pf.enabled) : current.pf.enabled,
        wageCeiling: finiteInRange(body.pf?.wageCeiling, current.pf.wageCeiling, 0, 1_000_000, "PF wage ceiling"),
      },
      esic: {
        enabled: body.esic?.enabled !== undefined ? Boolean(body.esic.enabled) : current.esic.enabled,
        grossCeiling: finiteInRange(body.esic?.grossCeiling, current.esic.grossCeiling, 0, 1_000_000, "ESIC gross ceiling"),
      },
      pt: { enabled: body.pt?.enabled !== undefined ? Boolean(body.pt.enabled) : current.pt.enabled, state },
      lwf: { enabled: body.lwf?.enabled !== undefined ? Boolean(body.lwf.enabled) : current.lwf.enabled },
      tds: {
        enabled: body.tds?.enabled !== undefined ? Boolean(body.tds.enabled) : current.tds.enabled,
        regime: body.tds?.regime === "old" ? "old" : body.tds?.regime === "new" ? "new" : current.tds.regime,
      },
    };

    // Salary split is Basic + the remainder; warn by normalising the legacy
    // allowances percentage instead of letting the two settings imply >100%.
    next.allowancesPercent = Math.max(0, 100 - next.basicPercent);

    await prisma.tenant.update({
      where: { id: session.tenantId },
      data: { config: { ...((tenant.config ?? {}) as Record<string, unknown>), payroll: next } as unknown as object },
    });
    return NextResponse.json({ success: true, config: next, defaults: DEFAULT_PAYROLL_CONFIG });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid payroll configuration." }, { status: 400 });
  }
}
