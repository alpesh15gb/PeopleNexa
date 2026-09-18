import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { renderIdCardPdf } from "@/lib/id-card-pdf";
import { photoPosition } from "@/lib/id-card-content";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = session.role === "location_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId
    : null;
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const deviceCode = request.nextUrl.searchParams.get("deviceCode")?.trim();
  if (!deviceCode) return NextResponse.json({ error: "Device ID is required." }, { status: 400 });
  const employee = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, deviceCode, ...(locationId ? { branch: { locationId } } : {}) }, select: { employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, joiningDate: true, phone: true, profilePicture: true, profile: { select: { bloodGroup: true } } } });
  if (!employee) return NextResponse.json({ error: "No employee matches this Device ID." }, { status: 404 });
  if (request.nextUrl.searchParams.get("format") !== "pdf") return NextResponse.json({ employee });
  const pdf = await renderIdCardPdf(employee, { x: photoPosition(request.nextUrl.searchParams.get("photoX")), y: photoPosition(request.nextUrl.searchParams.get("photoY")) });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="id-card-${employee.deviceCode ?? employee.employeeNumber}.pdf"` } });
}
