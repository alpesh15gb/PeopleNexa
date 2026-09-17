import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { getEbioserverConfig, getEbioserverPassword, setEbioUserDeviceAccess } from "@/lib/ebioserver";

async function locationIdFor(session: { sub: string; tenantId: string; role: string }) {
  if (session.role !== "location_manager") return null;
  return (await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    select: { locationId: true },
  }))?.locationId ?? null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const locationId = await locationIdFor(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const locationScope = locationId ? { branch: { locationId } } : {};
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId, ...locationScope }, select: { id: true, deviceCode: true, deviceAccessEnabled: true } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [devices, access] = await Promise.all([
    prisma.device.findMany({ where: { tenantId: session.tenantId, status: "active", config: { path: ["ebioserver"], equals: true }, ...locationScope }, select: { id: true, name: true, serialNumber: true }, orderBy: { name: "asc" } }),
    prisma.employeeDeviceAccess.findMany({ where: { employeeId: id, tenantId: session.tenantId }, select: { deviceId: true, allowed: true, commandStatus: true, lastCommandAt: true, lastError: true } }),
  ]);
  const state = new Map(access.map((row) => [row.deviceId, row]));
  return NextResponse.json({
    deviceCode: employee.deviceCode,
    enabled: employee.deviceAccessEnabled,
    devices: devices.map((device) => ({ ...device, ...(state.get(device.id) ?? { allowed: false, commandStatus: employee.deviceAccessEnabled ? "pending" : "unrestricted", lastCommandAt: null, lastError: null }) })),
    deviceIds: access.filter((row) => row.allowed && devices.some((device) => device.id === row.deviceId)).map((row) => row.deviceId),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as { deviceIds?: unknown } | null;
  if (!body || !Array.isArray(body.deviceIds) || !body.deviceIds.every((value) => typeof value === "string")) {
    return NextResponse.json({ error: "deviceIds must be an array." }, { status: 400 });
  }
  const deviceIds = [...new Set(body.deviceIds)];
  const locationId = await locationIdFor(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const locationScope = locationId ? { branch: { locationId } } : {};
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId, ...locationScope }, select: { id: true, deviceCode: true } });
  if (!employee?.deviceCode) return NextResponse.json({ error: "Employee needs a Device Code before device access can be restricted." }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });
  const profile = getEbioserverConfig(tenant);
  if (!profile.enabled || !profile.url || !getEbioserverPassword(profile)) {
    return NextResponse.json({ error: "eBioserver connection is not configured and enabled for this workspace." }, { status: 400 });
  }
  const devices = await prisma.device.findMany({ where: { tenantId: session.tenantId, status: "active", config: { path: ["ebioserver"], equals: true }, ...locationScope }, select: { id: true, serialNumber: true, name: true } });
  if (deviceIds.some((deviceId) => !devices.some((device) => device.id === deviceId))) return NextResponse.json({ error: "Invalid device selection." }, { status: 400 });
  const selected = new Set(deviceIds);
  const previous = await prisma.employeeDeviceAccess.findMany({ where: { employeeId: id, tenantId: session.tenantId, allowed: true }, select: { deviceId: true } });

  // Persist the desired policy first, but mark every machine pending until eBio
  // accepts the command. An empty eBio response means command sent, not verified.
  await prisma.$transaction([
    prisma.employee.update({ where: { id }, data: { deviceAccessEnabled: true } }),
    prisma.employeeDeviceAccess.deleteMany({ where: { employeeId: id, tenantId: session.tenantId, ...(session.role === "location_manager" ? { deviceId: { in: devices.map((device) => device.id) } } : {}) } }),
    prisma.employeeDeviceAccess.createMany({ data: devices.map((device) => ({ tenantId: session.tenantId, employeeId: id, deviceId: device.id, allowed: selected.has(device.id), commandStatus: "pending" })) }),
  ]);

  const results: Array<{ deviceId: string; name: string; allowed: boolean; status: "sent" | "failed"; response?: string; error?: string }> = [];
  for (const device of devices) {
    const allowed = selected.has(device.id);
    try {
      const response = await setEbioUserDeviceAccess(profile, device.serialNumber, employee.deviceCode, allowed);
      await prisma.employeeDeviceAccess.update({ where: { employeeId_deviceId: { employeeId: id, deviceId: device.id } }, data: { commandStatus: "sent", lastCommandAt: new Date(), lastError: null } });
      results.push({ deviceId: device.id, name: device.name, allowed, status: "sent", response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed";
      await prisma.employeeDeviceAccess.update({ where: { employeeId_deviceId: { employeeId: id, deviceId: device.id } }, data: { commandStatus: "failed", lastCommandAt: new Date(), lastError: message } });
      results.push({ deviceId: device.id, name: device.name, allowed, status: "failed", error: message });
    }
  }
  await appendAudit({
    tenantId: session.tenantId, actorId: session.sub, actorRole: session.role,
    action: "employee.device_access.update", entity: "Employee", entityId: id,
    summary: `Updated biometric device access for ${employee.deviceCode}`,
    before: { deviceIds: previous.map((row) => row.deviceId) },
    after: { deviceIds, results: results.map(({ response: _response, ...result }) => result) },
  });
  return NextResponse.json({ results, note: "Sent means eBio accepted the command request. Confirm physical access on the device." }, { status: results.some((result) => result.status === "failed") ? 207 : 200 });
}
