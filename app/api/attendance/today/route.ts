import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { startOfDay, addDays, toDateKey, formatTime } from "@/lib/dates";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    include: { shift: true, branch: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dayStart = startOfDay(new Date());
  const record = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: { gte: dayStart, lt: addDays(dayStart, 1) } },
  });

  return NextResponse.json({
    date: toDateKey(dayStart),
    record,
    shift: employee.shift,
    branch: employee.branch,
    now: formatTime(new Date()),
  });
}
