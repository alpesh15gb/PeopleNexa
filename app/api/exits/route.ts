import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateIST, isDateKey } from "@/lib/dates";
import { notifyAdmins } from "@/lib/notifications";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";

/** GET — exit requests (admins see all, employees see their own). */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const self = req.nextUrl.searchParams.get("scope") === "self";
  const locationId = self ? null : await managerLocationId(session);
  if (!self && session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const [requests, tenant] = await Promise.all([prisma.exitRequest.findMany({
    where: {
      tenantId: session.tenantId,
      ...(locationId ? { employee: employeeLocationScope(locationId) } : self || session.role !== "admin" ? { employeeId: session.sub } : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  }), prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } })]);
  return NextResponse.json({ requests, region: workspaceRegion(tenant.config) });
}

/** POST — an employee raises a resignation / exit request. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const resignationKey = typeof body?.resignationDate === "string" ? body.resignationDate : "";
  const lastWorkingDayKey = typeof body?.lastWorkingDay === "string" ? body.lastWorkingDay : "";
  if (!reason || reason.length > 2000) return NextResponse.json({ error: "Enter a reason of up to 2,000 characters." }, { status: 400 });
  if (!isDateKey(resignationKey) || !isDateKey(lastWorkingDayKey)) return NextResponse.json({ error: "Enter valid exit dates." }, { status: 400 });
  if (lastWorkingDayKey < resignationKey) {
    return NextResponse.json({ error: "Last working day must be on or after the resignation date." }, { status: 400 });
  }

  const resignationDate = new Date(`${resignationKey}T00:00:00Z`);
  const lastWorkingDay = new Date(`${lastWorkingDayKey}T00:00:00Z`);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId, status: "active", loginOnly: false }, select: { firstName: true, lastName: true } });
      if (!employee) return { error: "Exit requests require an active staff account.", status: 403 };
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } });
      if (resignationKey > dateKeyInTimeZone(new Date(), workspaceRegion(tenant.config).timeZone)) return { error: "Resignation date must be today or earlier.", status: 400 };
      const active = await tx.exitRequest.findFirst({
        where: { tenantId: session.tenantId, employeeId: session.sub, status: { in: ["pending", "approved"] } },
        select: { id: true },
      });
      if (active) return { error: "You already have an open exit request.", status: 409 };

      const request = await tx.exitRequest.create({
        data: { tenantId: session.tenantId, employeeId: session.sub, reason, resignationDate, lastWorkingDay },
      });
      await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "exit.submit", entity: "ExitRequest", entityId: request.id, summary: "Submitted exit request", after: { status: request.status, resignationDate: resignationDate.toISOString(), lastWorkingDay: lastWorkingDay.toISOString() } } });
      return { request: { ...request, employee } };
    }, { isolationLevel: "Serializable" });
    if (!result.request) return NextResponse.json({ error: result.error }, { status: result.status });

    const { request } = result;
    await notifyAdmins(session.tenantId, "info", "Resignation received", `${request.employee.firstName} ${request.employee.lastName} submitted an exit request for ${formatDateIST(lastWorkingDay)}.`)
      .catch((error) => console.warn("Failed to notify admins about exit request", error));
    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") return NextResponse.json({ error: "Your exit request changed. Refresh to view its status." }, { status: 409 });
    throw error;
  }
}
