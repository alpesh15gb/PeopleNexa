import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { renderIdCardPdf } from "@/lib/id-card-pdf";
import { photoPosition } from "@/lib/id-card-content";
import { resolveCompanyBranding } from "@/lib/company-branding";
import { idCardTemplate, resolveConfiguration } from "@/lib/configuration";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = session.role === "location_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId
    : null;
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const deviceCode = request.nextUrl.searchParams.get("deviceCode")?.trim();
  if (!deviceCode) return NextResponse.json({ error: "Device ID is required." }, { status: 400 });
  const [tenant, employee] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true, address: true, phone: true, email: true, profile: true } }),
    prisma.employee.findFirst({ where: { tenantId: session.tenantId, deviceCode, ...(locationId ? { branch: { locationId } } : {}) }, select: { id: true, employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, joiningDate: true, idCardIssuedAt: true, idCardValidUntil: true, phone: true, profilePicture: true, locationId: true, profile: { select: { bloodGroup: true } }, branch: { select: { locationId: true, location: { select: { profile: true } } } }, location: { select: { profile: true } } } }),
  ]);
  if (!employee) return NextResponse.json({ error: "No employee matches this Device ID." }, { status: 404 });
  const branding = resolveCompanyBranding(tenant, employee.branch?.location ?? employee.location);
  const employeeLocationId = employee.branch?.locationId ?? employee.locationId;
  const records = await prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "id_card", active: true }, select: { id: true, locationId: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true } });
  const templateRecord = resolveConfiguration(records, employeeLocationId);
  const template = idCardTemplate(templateRecord?.payload);
  if (request.nextUrl.searchParams.get("format") !== "pdf") return NextResponse.json({ employee, branding, template });
  const pdf = await renderIdCardPdf(employee, { x: photoPosition(request.nextUrl.searchParams.get("photoX")), y: photoPosition(request.nextUrl.searchParams.get("photoY")) }, branding, template);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="id-card-${employee.deviceCode ?? employee.employeeNumber}.pdf"` } });
}
