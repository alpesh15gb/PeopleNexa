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
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId, ...locationScope }, select: { id: true, deviceCode: true, deviceAccessEnabled: true, status: true } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [devices, access] = await Promise.all([
    prisma.device.findMany({ where: { tenantId: session.tenantId, status: "active", config: { path: ["ebioserver"], equals: true }, ...locationScope }, select: { id: true, name: true, serialNumber: true }, orderBy: { name: "asc" } }),
    prisma.employeeDeviceAccess.findMany({ where: { employeeId: id, tenantId: session.tenantId }, select: { deviceId: true, allowed: true, commandStatus: true, lastCommandAt: true, lastResponse: true, lastError: true } }),
  ]);
  let accessAvailable = false;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
    const profile = tenant ? getEbioserverConfig(tenant) : null;
    accessAvailable = Boolean(profile?.enabled && profile.url && getEbioserverPassword(profile));
  } catch {
    // An unreadable encrypted profile is not a reason to block core HR flows.
  }
  const state = new Map(access.map((row) => [row.deviceId, row]));
  return NextResponse.json({
    deviceCode: employee.deviceCode,
    enabled: employee.deviceAccessEnabled,
    status: employee.status,
    accessAvailable,
    provisioning: "access_only",
    provisioningNote: "This eBioserver connection supports access commands for existing device users only; it cannot create or name a user on a machine.",
    mode: employee.status === "inactive" ? "blocked" : employee.deviceAccessEnabled ? "restricted" : "all",
    devices: devices.map((device) => {
      const policy = state.get(device.id) ?? { allowed: employee.status === "active" && !employee.deviceAccessEnabled, commandStatus: employee.status === "inactive" ? "pending" : employee.deviceAccessEnabled ? "pending" : "unrestricted", lastCommandAt: null, lastResponse: null, lastError: null };
      return { ...device, ...policy, blocked: !policy.allowed };
    }),
    deviceIds: access.filter((row) => row.allowed && devices.some((device) => device.id === row.deviceId)).map((row) => row.deviceId),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as { mode?: unknown; deviceIds?: unknown } | null;
  if (!body || (body.mode !== "all" && body.mode !== "restricted") || !Array.isArray(body.deviceIds) || !body.deviceIds.every((value) => typeof value === "string")) {
    return NextResponse.json({ error: "mode and deviceIds are required." }, { status: 400 });
  }
  const deviceIds = [...new Set(body.deviceIds)];
  const locationId = await locationIdFor(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const locationScope = locationId ? { branch: { locationId } } : {};
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId, ...locationScope }, select: { id: true, deviceCode: true, status: true } });
  if (!employee?.deviceCode) return NextResponse.json({ error: "Employee needs a Device Code before device access can be managed." }, { status: 400 });
  if (employee.status !== "active") return NextResponse.json({ error: "Inactive employees are blocked on all active eBio devices and cannot be granted device access." }, { status: 409 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });
  const profile = getEbioserverConfig(tenant);
  if (body.mode === "restricted" && (!profile.enabled || !profile.url || !getEbioserverPassword(profile))) {
    return NextResponse.json({ error: "eBioserver connection is not configured and enabled for this workspace." }, { status: 400 });
  }
  const devices = await prisma.device.findMany({ where: { tenantId: session.tenantId, status: "active", config: { path: ["ebioserver"], equals: true }, ...locationScope }, select: { id: true, serialNumber: true, name: true } });
  if (deviceIds.some((deviceId) => !devices.some((device) => device.id === deviceId))) return NextResponse.json({ error: "Invalid device selection." }, { status: 400 });
  const selected = new Set(deviceIds);
  const previous = await prisma.employeeDeviceAccess.findMany({ where: { employeeId: id, tenantId: session.tenantId, allowed: true }, select: { deviceId: true } });

  // Persist the desired policy first, but mark every machine pending until eBio
  // accepts the command. An empty eBio response means command sent, not verified.
  await prisma.$transaction([
    prisma.employee.update({ where: { id }, data: { deviceAccessEnabled: body.mode === "restricted" } }),
    ...devices.map((device) => prisma.employeeDeviceAccess.upsert({
      where: { employeeId_deviceId: { employeeId: id, deviceId: device.id } },
      create: { tenantId: session.tenantId, employeeId: id, deviceId: device.id, allowed: body.mode === "all" || selected.has(device.id), commandStatus: "pending", lastError: null, lastResponse: null },
      update: { allowed: body.mode === "all" || selected.has(device.id), commandStatus: "pending", lastError: null, lastResponse: null },
    })),
  ]);

  const results: Array<{ deviceId: string; name: string; allowed: boolean; status: "sent" | "failed"; response?: string; error?: string }> = [];
  for (const device of devices) {
    const allowed = body.mode === "all" || selected.has(device.id);
    if (!profile.enabled || !profile.url || !getEbioserverPassword(profile)) {
      const error = "eBioserver connection is not configured and enabled for this workspace.";
      await prisma.employeeDeviceAccess.update({ where: { employeeId_deviceId: { employeeId: id, deviceId: device.id } }, data: { commandStatus: "failed", lastCommandAt: new Date(), lastError: error } });
      results.push({ deviceId: device.id, name: device.name, allowed, status: "failed", error });
      continue;
    }
    try {
      const response = await setEbioUserDeviceAccess(profile, device.serialNumber, employee.deviceCode, allowed);
      await prisma.employeeDeviceAccess.update({ where: { employeeId_deviceId: { employeeId: id, deviceId: device.id } }, data: { commandStatus: "sent", lastCommandAt: new Date(), lastResponse: response, lastError: null } });
      results.push({ deviceId: device.id, name: device.name, allowed, status: "sent", response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed";
      await prisma.employeeDeviceAccess.update({ where: { employeeId_deviceId: { employeeId: id, deviceId: device.id } }, data: { commandStatus: "failed", lastCommandAt: new Date(), lastResponse: null, lastError: message } });
      results.push({ deviceId: device.id, name: device.name, allowed, status: "failed", error: message });
    }
  }
  await appendAudit({
    tenantId: session.tenantId, actorId: session.sub, actorRole: session.role,
    action: "employee.device_access.update", entity: "Employee", entityId: id,
    summary: `Updated biometric device access for ${employee.deviceCode}`,
    before: { deviceIds: previous.map((row) => row.deviceId) },
    after: { mode: body.mode, deviceIds, results: results.map(({ response: _response, ...result }) => result) },
  });
  return NextResponse.json({ results, note: "Sent means eBio accepted the command request. Confirm physical access on the device." }, { status: results.some((result) => result.status === "failed") ? 207 : 200 });
}
