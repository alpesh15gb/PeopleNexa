import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey } from "@/lib/dates";

const TYPES = ["cash_in", "cash_out"] as const;
const CATEGORIES = ["salary", "advance", "vendor", "expense", "other"] as const;
const MODES = ["cash", "upi", "bank", "other"] as const;

// NOTE: Cash salary payments do NOT auto-post cashbook rows (skip auto-posting
// by design). Payroll "paid" status only tracks payout metadata on the payslip
// (paidVia/paidAt/paymentRef). Admins record cash movement here manually so the
// ledger stays an explicit, reviewable book rather than a derived projection.

function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
}

/** GET — admin lists entries for a month (?month=YYYY-MM), tenant-scoped, newest first. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month");
  let dateFilter: { gte: Date; lt: Date } | undefined;
  if (month !== null && month !== "") {
    if (!isMonthKey(month)) {
      return NextResponse.json({ error: "month must be YYYY-MM." }, { status: 400 });
    }
    const { gte, lt } = monthRange(month);
    dateFilter = { gte, lt };
  }

  const entries = await prisma.cashbookEntry.findMany({
    where: {
      tenantId: session.tenantId,
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  const cashIn = entries.filter((e) => e.type === "cash_in").reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter((e) => e.type === "cash_out").reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({
    entries,
    summary: { cashIn, cashOut, balance: cashIn - cashOut },
  });
}

/** POST — admin records a cash-in / cash-out entry. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const date = new Date(body.date);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Enter a valid date." }, { status: 400 });
  }

  const type = String(body.type ?? "");
  if (!(TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "type must be cash_in or cash_out." }, { status: 400 });
  }

  const category = String(body.category ?? "");
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: "category must be salary, advance, vendor, expense or other." }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }

  const noteRaw = body.note === undefined || body.note === null ? "" : String(body.note).trim();
  if (noteRaw.length > 500) {
    return NextResponse.json({ error: "Note must be 500 characters or fewer." }, { status: 400 });
  }
  const note = noteRaw === "" ? null : noteRaw;

  let paymentMode: string | null = null;
  if (body.paymentMode !== undefined && body.paymentMode !== null && String(body.paymentMode).trim() !== "") {
    const v = String(body.paymentMode).trim().toLowerCase();
    if (!(MODES as readonly string[]).includes(v)) {
      return NextResponse.json({ error: "paymentMode must be cash, upi, bank or other." }, { status: 400 });
    }
    paymentMode = v;
  }

  const entry = await prisma.cashbookEntry.create({
    data: {
      tenantId: session.tenantId,
      date,
      type,
      category,
      amount,
      note,
      paymentMode,
      createdBy: session.sub,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
