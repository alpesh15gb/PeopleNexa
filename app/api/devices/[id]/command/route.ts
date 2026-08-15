import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEbioserverConfig, getEbioserverPassword, runDeviceCommand } from "@/lib/ebioserver";

const ICK_COMMANDS: Record<string, (now: Date) => string> = {
  sync: () => "DATA QUERY ATTLOG StartTime=2000-01-01 00:00:00\tEndTime=2099-12-31 23:59:59",
  reboot: () => "REBOOT",
  clear_logs: () => "CLEAR LOGS",
  set_time: (now) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `SET TIME ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  },
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.device.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { tenant: { select: { config: true } } },
  });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  // eBioserver-managed devices (auto-registered from GetDeviceList) are
  // commanded through the tenant's own eBioserver instead of the iclock queue.
  const deviceConfig = (device.config ?? {}) as { ebioserver?: boolean };
  if (deviceConfig.ebioserver) {
    const profile = getEbioserverConfig(device.tenant);
    if (!profile.enabled || !getEbioserverPassword(profile)) {
      return NextResponse.json(
        { error: "eBioserver connection is not configured for this workspace." },
        { status: 400 }
      );
    }
    const result = await runDeviceCommand(profile, device.serialNumber, action);
    return NextResponse.json(
      result.ok ? { success: true, message: result.message } : { error: result.message },
      { status: result.ok ? 200 : 400 }
    );
  }

  const builder = ICK_COMMANDS[action];
  if (!builder) return NextResponse.json({ error: "Unknown command." }, { status: 400 });

  const command = builder(new Date());
  const queued = await prisma.deviceCommand.create({
    data: { deviceId: device.id, command, status: "pending" },
  });
  return NextResponse.json({ queued }, { status: 201 });
}
