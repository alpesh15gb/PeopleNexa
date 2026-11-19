import { enrichAuditEntries } from "@/lib/audit-display";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { auditFilters, auditLogPage, auditRangeInvalid } from "@/lib/audit-log-query";
import { recordPageNumber } from "@/lib/document-expense-pagination";
import { prisma } from "@/lib/prisma";
import { workspaceRegion } from "@/lib/workspace-region";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const filters = auditFilters({ action: sp.get("action"), entity: sp.get("entity"), q: sp.get("q"), from: sp.get("from"), to: sp.get("to") });
  if (auditRangeInvalid(filters)) return NextResponse.json({ error: "Choose a valid audit date range." }, { status: 400 });
  const page = recordPageNumber(sp.get("page")) ?? 1;
  const rawTake = Number(sp.get("take") ?? "50");
  const take = Number.isFinite(rawTake) ? Math.min(Math.max(Math.floor(rawTake), 1), 200) : 50;

  const tenant = filters.from || filters.to ? await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }) : null;
  const { rows, pagination } = await auditLogPage(session.tenantId, filters, page, take, workspaceRegion(tenant?.config).timeZone);

  const entries = await enrichAuditEntries(rows, session.tenantId);

  return NextResponse.json({ entries, pagination });
}
