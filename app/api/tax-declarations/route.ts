import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fyFromMonth } from "@/lib/payroll";

/** GET — declarations. Admins see everyone (optionally by FY), employees see their own. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const fy = req.nextUrl.searchParams.get("fy");
  const declarations = await prisma.taxDeclaration.findMany({
    where: {
      tenantId: session.tenantId,
      ...(fy ? { fy } : {}),
      ...(session.role !== "admin" ? { employeeId: session.sub } : {}),
    },
    include:
      session.role === "admin"
        ? { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } }
        : undefined,
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ declarations });
}

/** POST — an employee submits/updates their declaration for a financial year. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fy = String(body.fy ?? fyFromMonth(new Date().toISOString().slice(0, 7))).trim();
  if (!/^\d{4}-\d{2}$/.test(fy)) return NextResponse.json({ error: "Invalid financial year." }, { status: 400 });

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  // Documented per-section caps (simplified, non-senior): 80c 150000,
  // 80d 50000, hra 300000, lta 50000, other 200000.
  const CAPS: Record<string, number> = { "80c": 150000, "80d": 50000, hra: 300000, lta: 50000, other: 200000 };
  for (const [key, cap] of Object.entries(CAPS)) {
    const val = num(body.sections?.[key]);
    if (val > cap) {
      return NextResponse.json({ error: `${key} exceeds the maximum allowed ${cap}.` }, { status: 400 });
    }
  }
  const sections = {
    "80c": num(body.sections?.["80c"]),
    "80d": num(body.sections?.["80d"]),
    hra: num(body.sections?.hra),
    lta: num(body.sections?.lta),
    other: num(body.sections?.other),
    total:
      num(body.sections?.["80c"]) + num(body.sections?.["80d"]) + num(body.sections?.hra) + num(body.sections?.lta) + num(body.sections?.other),
  };

  try {
    return await prisma.$transaction(async (tx) => {
      const where = { employeeId_fy: { employeeId: session.sub, fy } };
      const existing = await tx.taxDeclaration.findUnique({ where });
      if (existing && existing.tenantId !== session.tenantId) {
        return NextResponse.json({ error: "Declaration not found in this workspace." }, { status: 403 });
      }
      if (existing?.status === "verified") {
        return NextResponse.json({ error: "Ask an independent reviewer to return this verified declaration before editing it." }, { status: 409 });
      }
      const declaration = await tx.taxDeclaration.upsert({
        where,
        update: { sections, status: "submitted", note: null },
        create: { tenantId: session.tenantId, employeeId: session.sub, fy, sections, status: "submitted" },
      });
      return NextResponse.json({ declaration }, { status: 201 });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (["P2002", "P2034"].includes((error as { code?: string })?.code ?? "")) {
      return NextResponse.json({ error: "The declaration changed. Refresh and try again." }, { status: 409 });
    }
    throw error;
  }
}
