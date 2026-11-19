import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";
import { dispatchWebhook } from "@/lib/webhooks";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { expenseSummary } from "@/lib/expense-records";
import { recordApiPaging, recordPagination } from "@/lib/document-expense-pagination";
import { formatRegionalMoney, workspaceRegion } from "@/lib/workspace-region";

const CATEGORIES = ["travel", "food", "fuel", "mobile", "medical", "other"];

/** POST — employee submits a claim (amount, category, optional receipt photo). */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "An expense claim object is required." }, { status: 400 });
  const title = String(body.title ?? "").trim();
  const category = String(body.category ?? "travel");
  const amount = Number(body.amount);
  const description = body.description ? String(body.description).trim() : null;
  const receiptUrl = body.receiptUrl ? String(body.receiptUrl) : null;

  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Unknown category." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }
  // Receipts are stored as data URLs (same pattern as punch selfies); cap size.
  if (receiptUrl && receiptUrl.length > 3_000_000) {
    return NextResponse.json({ error: "Receipt image is too large (max ~2MB)." }, { status: 400 });
  }

  const claim = await prisma.expenseClaim.create({
    data: {
      tenantId: session.tenantId,
      employeeId: session.sub,
      title,
      category,
      amount,
      description,
      receiptUrl,
    },
  });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
    const amountLabel = formatRegionalMoney(amount, workspaceRegion(tenant?.config));
    await notifyAdmins(session.tenantId, "info", "New expense claim", `${amountLabel} · ${title} (${category})`);
  } catch {
    console.error("Could not notify admins of submitted expense", claim.id);
  }

  await dispatchWebhook(session.tenantId, "expense.created", {
    claimId: claim.id,
    employeeId: claim.employeeId,
    title: claim.title,
    category: claim.category,
    amount: claim.amount,
  });

  return NextResponse.json({ claim }, { status: 201 });
}

/** GET — employees see their own; admins see all + summary. */
export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const requested = recordApiPaging(request.nextUrl.searchParams, 200);
  if (!requested) return NextResponse.json({ error: "Use a positive integer page and a pageSize from 1 to 200." }, { status: 400 });
  const where = {
    tenantId: session.tenantId,
    ...(locationId ? { employee: employeeLocationScope(locationId) } : session.role === "admin" ? {} : { employeeId: session.sub }),
  };
  const { total, byStatus } = await expenseSummary(where);
  const pagination = recordPagination(total, requested.page, requested.pageSize);
  const claims = await prisma.expenseClaim.findMany({
    where,
    include: (session.role === "admin" || session.role === "location_manager")
      ? { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
  });

  return NextResponse.json({
    claims,
    summary: {
      pending: byStatus.get("pending")?._count._all ?? 0,
      approved: byStatus.get("approved")?._count._all ?? 0,
      settled: byStatus.get("settled")?._count._all ?? 0,
    },
    pagination,
  });
}
