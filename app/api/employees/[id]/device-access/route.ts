import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { getEbioserverConfig, setEbioUserDeviceAccess } from "@/lib/ebioserver";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true, deviceCode: true } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [devices, access] = await Promise.all([
    prisma.device.findMany({ where: { tenantId: session.tenantId, config: { path: ["ebioserver"], equals: true } }, select: { id: true, name: true, serialNumber: true }, orderBy: { name: "asc" } }),
    prisma.employeeDeviceAccess.findMany({ where: { employeeId: id }, select: { deviceId: true } }),
  ]);
  return NextResponse.json({ deviceCode: employee.deviceCode, devices, deviceIds: access.map((row) => row.deviceId) });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const deviceIds = (await req.json()).deviceIds;
  if (!Array.isArray(deviceIds) || !deviceIds.every((value) => typeof value === "string")) return NextResponse.json({ error: "deviceIds must be an array." }, { status: 400 });
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true, deviceCode: true } });
  if (!employee?.deviceCode) return NextResponse.json({ error: "Employee needs a Device Code before device access can be restricted." }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });
  const profile = getEbioserverConfig(tenant);
  const devices = await prisma.device.findMany({ where: { tenantId: session.tenantId, config: { path: ["ebioserver"], equals: true } }, select: { id: true, serialNumber: true } });
  if (deviceIds.some((deviceId) => !devices.some((device) => device.id === deviceId))) return NextResponse.json({ error: "Invalid device selection." }, { status: 400 });
  const selected = new Set(deviceIds);
  const results: Array<{ deviceId: string; result?: string; error?: string }> = [];
  for (const device of devices) {
    try { results.push({ deviceId: device.id, result: await setEbioUserDeviceAccess(profile, device.serialNumber, employee.deviceCode, selected.has(device.id)) }); }
    catch (error) { results.push({ deviceId: device.id, error: error instanceof Error ? error.message : "Command failed" }); }
  }
  await prisma.$transaction([
    prisma.employeeDeviceAccess.deleteMany({ where: { employeeId: employee.id } }),
    prisma.employeeDeviceAccess.createMany({ data: deviceIds.map((deviceId) => ({ tenantId: session.tenantId, employeeId: employee.id, deviceId })) }),
  ]);
  return NextResponse.json({ results });
}
