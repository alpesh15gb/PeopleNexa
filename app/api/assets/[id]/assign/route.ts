import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });

  const asset = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? { locationId } : {}) } });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
  if (asset.status !== "available") {
    return NextResponse.json({ error: "Only available assets can be assigned. Return it or mark it available first." }, { status: 400 });
  }

  const body = await req.json();
  const employeeId = String(body.employeeId ?? "");
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId, status: "active", ...(locationId ? employeeLocationScope(locationId) : {}) },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 400 });
  }

  const note = body.note ? String(body.note).trim() : null;

  await prisma.$transaction([
    prisma.assetAssignment.create({
      data: {
        assetId: asset.id,
        employeeId: employee.id,
        assignedBy: session.sub,
        note,
      },
    }),
    prisma.asset.update({ where: { id: asset.id }, data: { status: "assigned" } }),
  ]);

  await notifyEmployee(
    session.tenantId,
    employee.id,
    "success",
    "Asset assigned",
    `${asset.name}${asset.tag ? ` (${asset.tag})` : ""} has been assigned to you.`
  );

  return NextResponse.json({ success: true });
}
