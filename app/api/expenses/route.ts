import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";
import { dispatchWebhook } from "@/lib/webhooks";

const CATEGORIES = ["travel", "food", "fuel", "mobile", "medical", "other"];

/** POST — employee submits a claim (amount, category, optional receipt photo). */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
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

  await notifyAdmins(
    session.tenantId,
    "info",
    "New expense claim",
    `₹${amount} — ${title} (${category})`
  );

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
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const where = session.role === "admin" ? { tenantId: session.tenantId } : { employeeId: session.sub };
  const [claims, pending, approved, settled] = await Promise.all([
    prisma.expenseClaim.findMany({
      where,
      include: session.role === "admin"
        ? { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.expenseClaim.count({ where: { ...where, status: "pending" } }),
    prisma.expenseClaim.count({ where: { ...where, status: "approved" } }),
    prisma.expenseClaim.count({ where: { ...where, status: "settled" } }),
  ]);

  return NextResponse.json({ claims, summary: { pending, approved, settled } });
}
