import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let locationId: string | null = null;
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
    locationId = manager.locationId;
  }
  const devices = await prisma.device.findMany({
    where: { tenantId: session.tenantId, ...(locationId ? { branch: { locationId } } : {}) },
    include: { _count: { select: { logs: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const serialNumber = String(body.serialNumber ?? "").trim();
    if (!name || !serialNumber) {
      return NextResponse.json({ error: "Name and serial number are required." }, { status: 400 });
    }
    const existing = await prisma.device.findUnique({ where: { serialNumber } });
    if (existing) {
      return NextResponse.json({ error: "A device with this serial number already exists." }, { status: 409 });
    }
    // Serials are globally unique across both fleets — a realtime device with
    // the same serial must also block creation.
    const existingRealtime = await prisma.realtimeDevice.findUnique({ where: { serialNumber } });
    if (existingRealtime) {
      return NextResponse.json({ error: "A device with this serial number already exists." }, { status: 409 });
    }
    // Location managers must attach the new device to a branch in their location.
    let branchId: string | null = null;
    if (session.role === "location_manager") {
      const manager = await prisma.employee.findFirst({
        where: { id: session.sub, tenantId: session.tenantId },
        select: { locationId: true },
      });
      if (!manager?.locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
      if (!body.branchId) {
        return NextResponse.json({ error: "A branch in your location is required." }, { status: 400 });
      }
      const branch = await prisma.branch.findFirst({
        where: { id: String(body.branchId), tenantId: session.tenantId, locationId: manager.locationId },
        select: { id: true },
      });
      if (!branch) return NextResponse.json({ error: "Branch must belong to your assigned location." }, { status: 403 });
      branchId = branch.id;
    } else if (body.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: String(body.branchId), tenantId: session.tenantId },
        select: { id: true },
      });
      if (!branch) return NextResponse.json({ error: "Branch not found in this workspace." }, { status: 400 });
      branchId = branch.id;
    }
    const device = await prisma.device.create({
      data: {
        tenantId: session.tenantId,
        name,
        serialNumber,
        ipAddress: body.ipAddress ? String(body.ipAddress).trim() : null,
        type: body.type || "biometric",
        protocol: body.protocol || "attlog",
        ...(branchId ? { branchId } : {}),
        config: {},
      },
    });
    return NextResponse.json({ device }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create device." }, { status: 500 });
  }
}
