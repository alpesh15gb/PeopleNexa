import { enrichAuditEntries } from "@/lib/audit-display";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action")?.trim() || undefined;
  const entity = sp.get("entity")?.trim() || undefined;
  const q = sp.get("q")?.trim() || undefined;
  const rawTake = Number(sp.get("take") ?? "50");
  const take = Number.isFinite(rawTake) ? Math.min(Math.max(Math.floor(rawTake), 1), 200) : 50;

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: session.tenantId,
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(q
        ? {
            OR: [
              { entityId: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  const entries = await enrichAuditEntries(rows, session.tenantId);

  return NextResponse.json({ entries });
}
