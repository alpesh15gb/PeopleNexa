import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey } from "@/lib/dates";
import { notifyAdmins, notifyEmployee } from "@/lib/notifications";

/** GET — exit requests (admins see all, employees see their own). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requests = await prisma.exitRequest.findMany({
    where: {
      tenantId: session.tenantId,
      ...(session.role !== "admin" ? { employeeId: session.sub } : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, salary: true, salaryStructure: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ requests });
}

/** POST — an employee raises a resignation / exit request. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  const resignationDate = fromDateKey(String(body.resignationDate ?? ""));
  const lastWorkingDay = fromDateKey(String(body.lastWorkingDay ?? ""));

  if (!reason) return NextResponse.json({ error: "Please state your reason for leaving." }, { status: 400 });
  if (isNaN(resignationDate.getTime()) || isNaN(lastWorkingDay.getTime())) {
    return NextResponse.json({ error: "Invalid dates." }, { status: 400 });
  }
  if (lastWorkingDay < resignationDate) {
    return NextResponse.json({ error: "Last working day must be on or after the resignation date." }, { status: 400 });
  }

  const active = await prisma.exitRequest.findFirst({
    where: { tenantId: session.tenantId, employeeId: session.sub, status: { in: ["pending", "approved"] } },
  });
  if (active) return NextResponse.json({ error: "You already have an open exit request." }, { status: 400 });

  const request = await prisma.exitRequest.create({
    data: {
      tenantId: session.tenantId,
      employeeId: session.sub,
      reason,
      resignationDate,
      lastWorkingDay,
      status: "pending",
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });

  await notifyAdmins(
    session.tenantId,
    "info",
    "Resignation received",
    `${request.employee.firstName} ${request.employee.lastName} has resigned — last working day ${lastWorkingDay.toISOString().slice(0, 10)}.`
  );

  return NextResponse.json({ request }, { status: 201 });
}
