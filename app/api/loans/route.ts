import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthKeyIST, isMonthKey } from "@/lib/dates";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const employeeId = req.nextUrl.searchParams.get("employeeId");
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const loans = await prisma.employeeLoan.findMany({
    where: { tenantId: session.tenantId, ...(employeeId ? { employeeId } : {}), ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ loans });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? "");
  const type = body.type === "loan" ? "loan" : "advance";
  const amount = Number(body.amount);
  const emiCount = type === "advance" ? 1 : Number(body.emiCount ?? 1);
  const startMonth = String(body.startMonth ?? monthKeyIST(new Date()));
  const note = body.note ? String(body.note).slice(0, 200) : null;

  if (!employeeId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Employee and a positive amount are required." }, { status: 400 });
  }
  if (!Number.isInteger(emiCount) || emiCount < 1 || emiCount > 60) {
    return NextResponse.json({ error: "Use a whole number of instalments from 1 to 60." }, { status: 400 });
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    return NextResponse.json({ error: "Enter an amount with at most two decimal places." }, { status: 400 });
  }
  if (!isMonthKey(startMonth)) {
    return NextResponse.json({ error: "Invalid startMonth. Use YYYY-MM." }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId, status: "active", loginOnly: false, ...(locationId ? employeeLocationScope(locationId) : {}) },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const emiAmount = type === "loan" && emiCount > 1 ? Math.ceil((amount / emiCount) * 100) / 100 : 0;
  if (!Number.isFinite(emiAmount) || (type === "loan" && emiCount > 1 && emiAmount <= 0)) {
    return NextResponse.json({ error: "Invalid EMI amount." }, { status: 400 });
  }
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
