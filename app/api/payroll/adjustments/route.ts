import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMonthKey, monthKey } from "@/lib/dates";

/** GET — adjustments for a month (admin). */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rawMonth = req.nextUrl.searchParams.get("month") || monthKey(new Date());
  if (!isMonthKey(rawMonth)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }
  const month = rawMonth;
  const adjustments = await prisma.payrollAdjustment.findMany({
    where: { tenantId: session.tenantId, month },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ adjustments });
}

/** POST — create an adjustment (arrears / bonus / one-off deduction). */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const month = String(body.month ?? monthKey(new Date()));
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }
  const employeeId = String(body.employeeId ?? "");
  const label = String(body.label ?? "").trim();
  const amount = Number(body.amount);
  const type = ["arrears", "bonus", "deduction", "other"].includes(String(body.type ?? "")) ? String(body.type) : "other";

  if (!label) return NextResponse.json({ error: "Label is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Amount must be a non-zero number (positive = earning, negative = deduction)." }, { status: 400 });
  }
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 400 });

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      tenantId: session.tenantId,
      employeeId,
      month,
      type,
      label,
      amount,
      note: body.note ? String(body.note) : null,
      createdBy: session.sub,
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
  });
  return NextResponse.json({ adjustment }, { status: 201 });
}
