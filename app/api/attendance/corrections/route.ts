import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/dates";
import { notifyAdmins } from "@/lib/notifications";

/** POST — employee raises a correction for a day. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date = body.date ? new Date(body.date) : null;
  const requestedIn = body.requestedIn ? new Date(body.requestedIn) : null;
  const requestedOut = body.requestedOut ? new Date(body.requestedOut) : null;
  const reason = String(body.reason ?? "").trim();

  if (!date || isNaN(date.getTime())) {
    return NextResponse.json({ error: "A date is required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Please explain why you need this correction." }, { status: 400 });
  }
  if (!requestedIn && !requestedOut) {
    return NextResponse.json({ error: "Provide at least one corrected punch time." }, { status: 400 });
  }

  const dayStart = startOfDay(date);
  const attendance = await prisma.attendance.findFirst({
    where: { employeeId: session.sub, date: dayStart },
  });
  if (!attendance) {
    return NextResponse.json(
      { error: "No attendance record found for that day — use the clock-in/out instead." },
      { status: 404 }
    );
  }

  // Don't allow a second pending correction for the same day.
  const existing = await prisma.punchCorrection.findFirst({
    where: { employeeId: session.sub, date: dayStart, status: "pending" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending correction for this day." }, { status: 400 });
  }

  const correction = await prisma.punchCorrection.create({
    data: {
      tenantId: session.tenantId,
      employeeId: session.sub,
      date: dayStart,
      currentIn: attendance.punchInTime,
      currentOut: attendance.punchOutTime,
      requestedIn,
      requestedOut,
      reason,
    },
  });

  await notifyAdmins(
    session.tenantId,
    "info",
    "Punch correction requested",
    `An employee requested a punch correction for ${dayStart.toISOString().slice(0, 10)}.`
  );

  return NextResponse.json({ correction }, { status: 201 });
}

/** GET — employees see their own; admins see everything (tenant-wide). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const corrections = await prisma.punchCorrection.findMany({
    where:
      session.role === "admin"
        ? { tenantId: session.tenantId }
        : { employeeId: session.sub },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ corrections });
}
