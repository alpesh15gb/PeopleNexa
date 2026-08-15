import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const employeeId = req.nextUrl.searchParams.get("employeeId");
  const loans = await prisma.employeeLoan.findMany({
    where: { tenantId: session.tenantId, ...(employeeId ? { employeeId } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ loans });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? "");
  const type = body.type === "loan" ? "loan" : "advance";
  const amount = Number(body.amount);
  const emiCount = Math.max(1, Math.min(Number(body.emiCount) || 1, 60));
  const startMonth = String(body.startMonth ?? monthKey(new Date()));
  const note = body.note ? String(body.note).slice(0, 200) : null;

  if (!employeeId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Employee and a positive amount are required." }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const emiAmount = type === "loan" && emiCount > 1 ? Math.ceil((amount / emiCount) * 100) / 100 : 0;

  const loan = await prisma.employeeLoan.create({
    data: {
      tenantId: session.tenantId,
      employeeId,
      type,
      amount,
      outstanding: amount,
      emiCount,
      emiAmount,
      startMonth,
      note,
    },
  });
  return NextResponse.json({ loan }, { status: 201 });
}
