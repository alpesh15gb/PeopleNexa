import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function findOwned(id: string, tenantId: string) {
  return prisma.device.findFirst({
    where: { id, tenantId },
    include: { branch: { select: { locationId: true } } },
  });
}

async function locationIdFor(session: { sub: string; tenantId: string }) {
  const manager = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    select: { locationId: true },
  });
  return manager?.locationId ?? null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await findOwned(id, session.tenantId);
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (session.role === "location_manager") {
    const locationId = await locationIdFor(session);
    if (!locationId || device.branch?.locationId !== locationId) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }
  }

  try {
    const body = await req.json();
    if (body.status !== undefined && body.status !== "active" && body.status !== "inactive") {
      return NextResponse.json({ error: "Invalid status. Allowed: active, inactive." }, { status: 400 });
    }
    if (body.type !== undefined && !["biometric", "face", "card"].includes(String(body.type))) {
      return NextResponse.json({ error: "Invalid type. Allowed: biometric, face, card." }, { status: 400 });
    }
    let branchId: string | null | undefined = undefined;
    if (body.branchId !== undefined) {
      if (session.role === "location_manager") {
        const locationId = await locationIdFor(session);
        if (!body.branchId) {
          return NextResponse.json({ error: "Device must stay assigned to a branch in your location." }, { status: 400 });
        }
        const branch = await prisma.branch.findFirst({
          where: { id: String(body.branchId), tenantId: session.tenantId, locationId: locationId ?? "__none__" },
          select: { id: true },
        });
        if (!branch) return NextResponse.json({ error: "Branch must belong to your assigned location." }, { status: 403 });
        branchId = branch.id;
      } else if (body.branchId === null || body.branchId === "") {
        branchId = null;
      } else {
        const branch = await prisma.branch.findFirst({
          where: { id: String(body.branchId), tenantId: session.tenantId },
          select: { id: true },
        });
        if (!branch) return NextResponse.json({ error: "Branch not found in this workspace." }, { status: 400 });
        branchId = branch.id;
      }
    }
    const updated = await prisma.device.update({
      where: { id },
      data: {
        ...(body.name ? { name: String(body.name).trim() } : {}),
        ...(body.ipAddress !== undefined ? { ipAddress: body.ipAddress ? String(body.ipAddress).trim() : null } : {}),
        ...(body.type ? { type: String(body.type) } : {}),
        ...(body.protocol ? { protocol: String(body.protocol) } : {}),
        ...(body.status ? { status: String(body.status) } : {}),
        ...(branchId !== undefined ? { branchId } : {}),
      },
    });
    return NextResponse.json({ device: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update device." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await findOwned(id, session.tenantId);
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (session.role === "location_manager") {
    const locationId = await locationIdFor(session);
    if (!locationId || device.branch?.locationId !== locationId) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }
  }

  // Destructive deletes would orphan attendance history — block while any
  // DeviceLog / Punch / DeviceCommand rows still reference this device.
  const [logCount, punchCount, commandCount] = await Promise.all([
    prisma.deviceLog.count({ where: { deviceId: id } }),
    prisma.punch.count({ where: { deviceId: id } }),
    prisma.deviceCommand.count({ where: { deviceId: id } }),
  ]);
  if (logCount + punchCount + commandCount > 0) {
    return NextResponse.json(
      { error: "Device has attendance history — retire instead; export logs first." },
      { status: 400 }
    );
  }

  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
