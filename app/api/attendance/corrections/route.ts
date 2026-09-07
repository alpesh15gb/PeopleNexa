import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseIST, istStartOfDay } from "@/lib/ist";
import { notifyAdmins } from "@/lib/notifications";

/** POST — employee raises a correction for a day. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // Parse all dates as IST wall-clock (devices/clients report IST, not UTC).
  const dateRaw = String(body.date ?? "").trim();
  let dayStart: Date | null = null;
  const dayMatch = dateRaw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dayMatch) {
    dayStart = parseIST(`${dayMatch[1]} 00:00:00`);
  } else if (dateRaw) {
    const parsed = parseIST(dateRaw);
    dayStart = parsed ? istStartOfDay(parsed) : null;
  }
  const requestedInRaw = body.requestedIn ? String(body.requestedIn).trim() : "";
  const requestedOutRaw = body.requestedOut ? String(body.requestedOut).trim() : "";
  const requestedIn = requestedInRaw ? parseIST(requestedInRaw) : null;
  const requestedOut = requestedOutRaw ? parseIST(requestedOutRaw) : null;
  const reason = String(body.reason ?? "").trim();

  if (!dayStart || isNaN(dayStart.getTime())) {
    return NextResponse.json({ error: "A date is required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Please explain why you need this correction." }, { status: 400 });
  }
  if (requestedInRaw && !requestedIn) {
    return NextResponse.json({ error: "Invalid corrected in-time." }, { status: 400 });
  }
  if (requestedOutRaw && !requestedOut) {
    return NextResponse.json({ error: "Invalid corrected out-time." }, { status: 400 });
  }
  if (!requestedIn && !requestedOut) {
    return NextResponse.json({ error: "Provide at least one corrected punch time." }, { status: 400 });
  }
  // Corrected in must precede corrected out.
  if (requestedIn && requestedOut && requestedIn.getTime() >= requestedOut.getTime()) {
    return NextResponse.json({ error: "Corrected in-time must be before out-time." }, { status: 400 });
  }
  // No future dates or punches.
  const now = new Date();
  if (dayStart.getTime() > istStartOfDay(now).getTime()) {
    return NextResponse.json({ error: "Cannot request a correction for a future date." }, { status: 400 });
  }
  if ((requestedIn && requestedIn.getTime() > now.getTime()) || (requestedOut && requestedOut.getTime() > now.getTime())) {
    return NextResponse.json({ error: "Corrected punch times cannot be in the future." }, { status: 400 });
  }

  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  // Guard against pre-joining + excessive backdate.
  const requester = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    select: { id: true, joiningDate: true },
  });
  if (requester?.joiningDate) {
    const joinStart = istStartOfDay(new Date(requester.joiningDate));
    if (dayStart.getTime() < joinStart.getTime()) {
      return NextResponse.json({ error: "Cannot request a correction before your joining date." }, { status: 400 });
    }
  }
  if (session.role !== "admin" && session.role !== "supervisor") {
    const backdateMs = istStartOfDay(now).getTime() - dayStart.getTime();
    if (backdateMs > 60 * 24 * 3600 * 1000) {
      return NextResponse.json({ error: "Corrections older than 60 days need admin assistance." }, { status: 400 });
    }
  }
  // Range lookup: Attendance.date may be normalized differently (shift-window
  // start for night shifts), so match the whole IST day instead of exact equality.
  const attendance = await prisma.attendance.findFirst({
    where: { employeeId: session.sub, date: { gte: dayStart, lt: dayEnd } },
  });
  // Allow absent-day corrections: no Attendance row just means there is
  // nothing recorded yet — store date only with null current punches.
  // (PunchCorrection has no required attendanceId; date is the link.)

  // The partial unique index is the final duplicate guard; serializable
  // transactions make the check and create one conflict-aware operation.
  let correction;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        correction = await prisma.$transaction(async (tx) => {
          const existing = await tx.punchCorrection.findFirst({
            where: { employeeId: session.sub, date: { gte: dayStart, lt: dayEnd }, status: "pending" },
          });
          if (existing) {
            const err = new Error("DUPLICATE_PENDING") as Error & { code?: string };
            err.code = "DUPLICATE_PENDING";
            throw err;
          }
          return tx.punchCorrection.create({
            data: {
              tenantId: session.tenantId,
              employeeId: session.sub,
              date: dayStart,
              currentIn: attendance?.punchInTime ?? null,
              currentOut: attendance?.punchOutTime ?? null,
              requestedIn,
              requestedOut,
              reason,
            },
          });
        }, { isolationLevel: "Serializable" });
        break;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code !== "P2034" || attempt === 2) throw e;
      }
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "DUPLICATE_PENDING") {
      return NextResponse.json({ error: "You already have a pending correction for this day." }, { status: 409 });
    }
    if (code === "P2002" || code === "P2034") {
      return NextResponse.json({ error: "You already have a pending correction for this day." }, { status: 409 });
    }
    throw e;
  }

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
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) {
      return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
    }
    const corrections = await prisma.punchCorrection.findMany({
      where: { tenantId: session.tenantId, employee: { branchId: manager.branchId } },
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

  const corrections = await prisma.punchCorrection.findMany({
    where:
      session.role === "admin" || session.role === "supervisor"
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
