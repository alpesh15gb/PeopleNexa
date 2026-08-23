import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? "").trim();
  if (!employeeId) return NextResponse.json({ error: "Employee is required." }, { status: 400 });

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId, status: "active" },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found or inactive." }, { status: 400 });
  const note = body.note ? String(body.note).trim() : null;

  try {
    const asset = await prisma.$transaction(async (tx) => {
      const current = await tx.asset.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!current) throw new Error("ASSET_NOT_FOUND");

      // Conditional update is the concurrency lock. Only one competing request
      // can change available -> assigned; the loser observes count=0.
      const claimed = await tx.asset.updateMany({
        where: { id, tenantId: session.tenantId, status: "available" },
        data: { status: "assigned" },
      });
      if (claimed.count !== 1) throw new Error(`ASSET_NOT_AVAILABLE:${current.status}`);

      const open = await tx.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null }, select: { id: true } });
      if (open) throw new Error("ASSET_HAS_OPEN_ASSIGNMENT");

      await tx.assetAssignment.create({
        data: { assetId: id, employeeId: employee.id, assignedBy: session.sub, note },
      });
      return current;
    });

    await notifyEmployee(session.tenantId, employee.id, "success", "Asset assigned", `${asset.name}${asset.tag ? ` (${asset.tag})` : ""} has been assigned to you.`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "ASSET_NOT_FOUND") return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    if (message.startsWith("ASSET_NOT_AVAILABLE")) {
      const status = message.split(":")[1] || "unavailable";
      return NextResponse.json({ error: `This asset is ${status} and cannot be assigned. It must be available first.` }, { status: 409 });
    }
    if (message === "ASSET_HAS_OPEN_ASSIGNMENT") return NextResponse.json({ error: "This asset already has an open assignment." }, { status: 409 });
    return NextResponse.json({ error: "Asset assignment failed." }, { status: 500 });
  }
}
