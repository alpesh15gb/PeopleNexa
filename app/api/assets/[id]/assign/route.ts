import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const asset = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
  if (asset.status === "assigned") {
    return NextResponse.json({ error: "This asset is already assigned. Return it first." }, { status: 400 });
  }

  const body = await req.json();
  const employeeId = String(body.employeeId ?? "");
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId, status: "active" },
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
