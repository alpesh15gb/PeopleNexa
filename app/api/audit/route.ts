import { enrichAuditEntries } from "@/lib/audit-display";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { auditFilters, auditLogPage } from "@/lib/audit-log-query";
import { recordPageNumber } from "@/lib/document-expense-pagination";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const filters = auditFilters({ action: sp.get("action"), entity: sp.get("entity"), q: sp.get("q") });
  const page = recordPageNumber(sp.get("page")) ?? 1;
  const rawTake = Number(sp.get("take") ?? "50");
  const take = Number.isFinite(rawTake) ? Math.min(Math.max(Math.floor(rawTake), 1), 200) : 50;

  const { rows, pagination } = await auditLogPage(session.tenantId, filters, page, take);

  const entries = await enrichAuditEntries(rows, session.tenantId);

  return NextResponse.json({ entries, pagination });
}
