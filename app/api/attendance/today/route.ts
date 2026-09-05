import { NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/dates";
import { istStartOfDay, istDateKey } from "@/lib/ist";
import { formatTime } from "@/lib/dates";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const employee = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    include: { shift: true, branch: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dayStart = istStartOfDay(new Date());
  const record = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, tenantId: session.tenantId, date: { gte: dayStart, lt: addDays(dayStart, 1) } },
  });

  return NextResponse.json({
    date: istDateKey(dayStart),
    record,
    shift: employee.shift,
    branch: employee.branch,
    now: formatTime(new Date()),
  });
}
