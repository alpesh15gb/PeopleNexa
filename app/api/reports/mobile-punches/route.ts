import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, isDateKey } from "@/lib/dates";
import { employeeLocationScope } from "@/lib/location-scope";
import { mobileSelfieBytes } from "@/lib/mobile-attendance";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const manager = ["branch_manager", "location_manager"].includes(session.role) ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true, locationId: true } }) : null;
  if ((session.role === "branch_manager" && !manager?.branchId) || (session.role === "location_manager" && !manager?.locationId)) return NextResponse.json({ error: "No assigned scope." }, { status: 403 });
  const employeeScope = session.role === "branch_manager" ? { branchId: manager!.branchId } : session.role === "location_manager" ? employeeLocationScope(manager!.locationId!) : {};
  const params = req.nextUrl.searchParams;
  const photoId = params.get("photo");
  if (photoId) {
    const punch = await prisma.punch.findFirst({ where: { id: photoId, tenantId: session.tenantId, source: "mobile", employee: employeeScope }, select: { selfie: true } });
    if (!punch?.selfie) return NextResponse.json({ error: "Photo unavailable or removed by retention policy." }, { status: 404 });
    try {
      return new NextResponse(new Uint8Array(mobileSelfieBytes(punch.selfie)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    } catch { return NextResponse.json({ error: "Photo is invalid." }, { status: 404 }); }
  }
  const from = params.get("from") ?? "", to = params.get("to") ?? from;
  if (!isDateKey(from) || !isDateKey(to)) return NextResponse.json({ error: "Select valid dates." }, { status: 400 });
  const start = dayRangeIST(from).start, end = dayRangeIST(to).end;
  if (end <= start || end.getTime() - start.getTime() > 93 * 86400000) return NextResponse.json({ error: "Select a range of up to 93 days." }, { status: 400 });
  const q = params.get("q")?.trim();
  const approval = params.get("approval");
  const where = { tenantId: session.tenantId, source: "mobile", punchTime: { gte: start, lt: end }, ...(approval && ["auto", "pending", "approved", "declined"].includes(approval) ? { authStatus: approval } : {}), employee: { ...employeeScope, ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { employeeNumber: { contains: q, mode: "insensitive" as const } }, { deviceCode: { contains: q, mode: "insensitive" as const } }] } : {}) } };
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const size = Math.max(10, Math.min(500, Math.floor(Number(params.get("size")) || 50)));
  const excel = params.get("format") === "xlsx";
  const total = await prisma.punch.count({ where });
  if (excel && total > 50000) return NextResponse.json({ error: "Narrow the export to 50,000 punches or fewer." }, { status: 400 });
  const punches = await prisma.punch.findMany({ where, orderBy: [{ punchTime: "desc" }, { id: "asc" }], skip: excel ? 0 : (page - 1) * size, take: excel ? 50000 : size, select: { id: true, punchTime: true, inOutHint: true, lat: true, lng: true, locationAccuracy: true, locationStatus: true, geofenceDistance: true, geofenceRadius: true, selfieCapturedAt: true, faceStatus: true, faceScore: true, authStatus: true, holdReason: true, employee: { select: { employeeNumber: true, firstName: true, lastName: true, branch: { select: { name: true } } } } } });
  // Query presence only: exporting thousands of rows must never fetch thousands
  // of base64 images. The authenticated photo endpoint loads one image on demand.
  const photoIds = new Set((await prisma.punch.findMany({ where: { ...where, id: { in: punches.map(punch => punch.id) }, selfie: { not: null } }, select: { id: true } })).map(punch => punch.id));
  const rows = punches.map(punch => ({ ...punch, photoUrl: photoIds.has(punch.id) ? `/api/reports/mobile-punches?photo=${encodeURIComponent(punch.id)}` : null }));
  if (!excel) return NextResponse.json({ total, page, size, rows }, { headers: { "Cache-Control": "private, no-store" } });
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Mobile Punches");
  sheet.columns = ["Employee Code", "Employee Name", "Branch", "Punch Time (IST)", "Direction", "Latitude", "Longitude", "GPS Accuracy (m)", "Location Check", "Geofence Distance (m)", "Geofence Radius (m)", "Face Status", "Face Score", "Approval", "Hold Reason", "Photo Available", "Photo Capture Time (IST)", "Punch ID"].map(header => ({ header, width: 24 }));
  const time = (value: Date | null) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "medium" }).format(value) : "";
  for (const row of rows) sheet.addRow([row.employee.employeeNumber, `${row.employee.firstName} ${row.employee.lastName}`.trim(), row.employee.branch?.name ?? "", time(row.punchTime), row.inOutHint, row.lat, row.lng, row.locationAccuracy, row.locationStatus ?? "Not recorded", row.geofenceDistance, row.geofenceRadius, row.faceStatus, row.faceScore, row.authStatus, row.holdReason, row.photoUrl ? "Yes (authenticated report)" : "No / expired", time(row.selfieCapturedAt), row.id]);
  sheet.getRow(1).font = { bold: true };
  return new NextResponse(new Uint8Array(await workbook.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="mobile-punches-${from}-to-${to}.xlsx"`, "Cache-Control": "private, no-store" } });
}
