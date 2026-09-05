import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPayrollConfig, DEFAULT_PAYROLL_CONFIG, type PayrollConfig } from "@/lib/payroll";

/** GET — current payroll configuration (per tenant). */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  return NextResponse.json({ config: getPayrollConfig(tenant?.config ?? null) });
}

/** PUT — update payroll configuration. */
export async function PUT(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const current = getPayrollConfig((await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }))?.config ?? null);

  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const clampPct = (n: number) => Math.min(100, Math.max(0, n));
  const nonNeg = (n: number) => Math.max(0, n);

  const next: PayrollConfig = {
    basicPercent: clampPct(num(body.basicPercent, current.basicPercent)),
    allowancesPercent: clampPct(num(body.allowancesPercent, current.allowancesPercent)),
    lateFinePerLateDay: nonNeg(num(body.lateFinePerLateDay, current.lateFinePerLateDay)),
    otMultiplier: nonNeg(num(body.otMultiplier, current.otMultiplier)),
    deductAbsentDays: Boolean(body.deductAbsentDays ?? current.deductAbsentDays),
    pf: {
      enabled: body.pf?.enabled !== undefined ? Boolean(body.pf.enabled) : current.pf.enabled,
      wageCeiling: nonNeg(num(body.pf?.wageCeiling, current.pf.wageCeiling)),
    },
    esic: {
      enabled: body.esic?.enabled !== undefined ? Boolean(body.esic.enabled) : current.esic.enabled,
      grossCeiling: nonNeg(num(body.esic?.grossCeiling, current.esic.grossCeiling)),
    },
    pt: {
      enabled: body.pt?.enabled !== undefined ? Boolean(body.pt.enabled) : current.pt.enabled,
      state: String(body.pt?.state ?? current.pt.state),
    },
    lwf: {
      enabled: body.lwf?.enabled !== undefined ? Boolean(body.lwf.enabled) : current.lwf.enabled,
    },
    tds: {
      enabled: body.tds?.enabled !== undefined ? Boolean(body.tds.enabled) : current.tds.enabled,
      regime: body.tds?.regime === "old" ? "old" : body.tds?.regime === "new" ? "new" : current.tds.regime,
    },
  };

  const tenant = await prisma.tenant.update({
    where: { id: session.tenantId },
    data: {
      config: {
        ...((await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }))?.config as Record<string, unknown> | null ?? {}),
        payroll: next,
      } as unknown as object,
    },
  });

  return NextResponse.json({ success: true, config: next, defaults: DEFAULT_PAYROLL_CONFIG });
}
