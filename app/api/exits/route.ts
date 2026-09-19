import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateIST, fromDateKey } from "@/lib/dates";
import { notifyAdmins, notifyEmployee } from "@/lib/notifications";
import { appendAudit } from "@/lib/audit";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

/** GET — exit requests (admins see all, employees see their own). */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const requests = await prisma.exitRequest.findMany({
    where: {
      tenantId: session.tenantId,
      ...(locationId ? { employee: employeeLocationScope(locationId) } : session.role !== "admin" ? { employeeId: session.sub } : {}),
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
  const session = await requireActiveSession().catch(() => null);
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
    `${request.employee.firstName} ${request.employee.lastName} has resigned — last working day ${formatDateIST(lastWorkingDay)}.`
  );
  await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "exit.submit", entity: "ExitRequest", entityId: request.id, summary: `${request.employee.firstName} ${request.employee.lastName} submitted an exit request`, after: { status: "pending", resignationDate: resignationDate.toISOString(), lastWorkingDay: lastWorkingDay.toISOString() } });

  return NextResponse.json({ request }, { status: 201 });
}
