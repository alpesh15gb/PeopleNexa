import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dayRangeIST } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import { attendanceDayForPunch, shiftForEmployeeDay } from "@/lib/reconcile";
import { workspaceRegion } from "@/lib/workspace-region";
import { formatWorkspaceTime } from "@/lib/workspace-time";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const employee = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    include: { shift: true, branch: true, tenant: { select: { config: true } } },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  const region = workspaceRegion(employee.tenant.config);
  const now = new Date();
  const dayStart = await attendanceDayForPunch(employee, now, region.timeZone);
  const date = istDateKey(dayStart);
  const record = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, tenantId: session.tenantId, date: { gte: dayStart, lt: dayRangeIST(date).end } },
  });

  return NextResponse.json({
    date,
    record,
    shift: await shiftForEmployeeDay(employee, dayStart, region.timeZone),
    branch: employee.branch,
    now: formatWorkspaceTime(now, region),
    timeZone: region.timeZone,
  });
}
