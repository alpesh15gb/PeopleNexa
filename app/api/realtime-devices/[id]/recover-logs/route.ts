import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const MAX_RANGE_DAYS = 90;

// POST { start_time, end_time } — recover old punches from local RealtimeLogs
// (range query; same shape as StaffKhata's async recover + poll).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { start_time?: unknown; end_time?: unknown };
  const start = new Date(String(body.start_time ?? ""));
  const end = new Date(String(body.end_time ?? ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: "Valid start_time/end_time are required" }, { status: 400 });
  }
  if ((end.getTime() - start.getTime()) / 86400000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "You can only pull up to 3 months of data at once." }, { status: 400 });
  }
  const logs = await prisma.realtimeLog.findMany({
    where: { realtimeDeviceId: id, punchTime: { gte: start, lte: end } },
    orderBy: { punchTime: "asc" },
    take: 5000,
  });
  const cmd = await prisma.realtimeCommand.create({
    data: {
      realtimeDeviceId: id,
      command: `RECOVER ${start.toISOString()}..${end.toISOString()} -> ${logs.length} logs`,
      status: "executed",
      response: JSON.stringify({ count: logs.length }),
    },
  });
  return NextResponse.json({
    success: true,
    command_id: cmd.id,
    count: logs.length,
    logs: logs.map((l) => ({ userId: l.userId, punchTime: l.punchTime, processed: l.processed, error: l.error })),
  });
}
