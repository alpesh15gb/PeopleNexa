import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { istStartOfDay } from "@/lib/ist";
import { notifyAdmins } from "@/lib/notifications";
import { dayRangeIST, formatDateIST, isDateKey } from "@/lib/dates";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, parseWorkspaceWallTime } from "@/lib/workspace-time";
import { shiftForEmployeeDay, shiftWindow } from "@/lib/reconcile";

/** POST — employee raises a correction for a day. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dateKey = String(body.date ?? "").trim().slice(0, 10);
  if (!isDateKey(dateKey)) return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  const { start: dayStart } = dayRangeIST(dateKey);
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const { timeZone } = workspaceRegion(tenant?.config);
  const requestedInRaw = body.requestedIn ? String(body.requestedIn).trim() : "";
  const requestedOutRaw = body.requestedOut ? String(body.requestedOut).trim() : "";
  const requestedIn = requestedInRaw ? parseWorkspaceWallTime(requestedInRaw, timeZone) : null;
  const requestedOut = requestedOutRaw ? parseWorkspaceWallTime(requestedOutRaw, timeZone) : null;
  const reason = String(body.reason ?? "").trim();

  if (!reason || reason.length > 2000) {
    return NextResponse.json({ error: "Enter a correction reason of up to 2,000 characters." }, { status: 400 });
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
  const today = dayRangeIST(dateKeyInTimeZone(now, timeZone)).start;
  if (dayStart > today) {
    return NextResponse.json({ error: "Cannot request a correction for a future date." }, { status: 400 });
  }
  if ((requestedIn && requestedIn.getTime() > now.getTime()) || (requestedOut && requestedOut.getTime() > now.getTime())) {
    return NextResponse.json({ error: "Corrected punch times cannot be in the future." }, { status: 400 });
  }

  // Guard against pre-joining + excessive backdate.
  const requester = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    select: { id: true, joiningDate: true, loginOnly: true, tenantId: true, branchId: true, shiftId: true },
  });
  if (!requester) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  if (requester.loginOnly) {
    return NextResponse.json({ error: "Manager logins cannot request corrections." }, { status: 403 });
  }
  if (requester.joiningDate) {
    const joinStart = istStartOfDay(new Date(requester.joiningDate));
    if (dayStart.getTime() < joinStart.getTime()) {
      return NextResponse.json({ error: "Cannot request a correction before your joining date." }, { status: 400 });
    }
  }
  if (session.role !== "admin" && session.role !== "supervisor") {
    const backdateMs = today.getTime() - dayStart.getTime();
    if (backdateMs > 60 * 24 * 3600 * 1000) {
      return NextResponse.json({ error: "Corrections older than 60 days need admin assistance." }, { status: 400 });
    }
  }
  const shift = await shiftForEmployeeDay(requester, dayStart, timeZone);
  const window = shiftWindow(dayStart, shift, timeZone);
  if ([requestedIn, requestedOut].some((punch) => punch && (punch < window.start || punch >= window.end))) {
    return NextResponse.json({ error: "The corrected times must fall within the selected attendance day's shift window." }, { status: 400 });
  }
  const attendance = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: session.sub, date: dayStart } },
  });
  if ((requestedIn && !requestedOut && attendance?.punchOutTime && requestedIn >= attendance.punchOutTime) ||
      (requestedOut && !requestedIn && attendance?.punchInTime && requestedOut <= attendance.punchInTime)) {
    return NextResponse.json({ error: "Clock-in must be before clock-out. Correct both times if both recorded punches are wrong." }, { status: 400 });
  }
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
            where: { employeeId: session.sub, date: dayStart, status: "pending" },
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
    `An employee requested a punch correction for ${formatDateIST(dayStart)}.`
  ).catch((error) => console.warn("[attendance correction] notification failed:", error));

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

  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) {
      return NextResponse.json({ error: "no location assigned" }, { status: 403 });
    }
    const corrections = await prisma.punchCorrection.findMany({
      where: { tenantId: session.tenantId, employee: { branch: { locationId: manager.locationId } } },
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
