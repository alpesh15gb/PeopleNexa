import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, payrollOperationLocationId } from "@/lib/location-scope";
import { isMonthKey } from "@/lib/dates";
import { readAttendanceWorkbook, previewPayrollAttendance, reviewAttendanceRows, nextPayrollMonth, type PayrollAttendanceRow } from "@/lib/payroll-attendance-import";
import { readPayrollWorkbook, savePayrollWorkbook, removePayrollWorkbook } from "@/lib/payroll-attendance-storage";
import { manualUploadId } from "@/lib/payroll-manual-source";

export const runtime = "nodejs";
async function context(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager"].includes(session.role)) return { error: "Forbidden", status: 403 } as const;
  const scope = await payrollOperationLocationId(session, req.nextUrl.searchParams.get("locationId"));
  if ("error" in scope) return { error: scope.error, status: 403 } as const;
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonthKey(month)) return { error: "Select a valid payroll month.", status: 400 } as const;
  return { session, locationId: scope.locationId, month };
}
export async function GET(req: NextRequest) {
  const ctx = await context(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const id = req.nextUrl.searchParams.get("id");
  const where = { tenantId: ctx.session.tenantId, locationId: ctx.locationId, month: ctx.month };
  if (!id) {
    const uploads = await prisma.payrollAttendanceImport.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, fileName: true, month: true, sheet: true, createdAt: true, reviewedAt: true, sourceHash: true } });
    const runId = req.nextUrl.searchParams.get("runId");
    const run = runId ? await prisma.payrollRun.findFirst({ where: { id: runId, ...where }, select: { payslips: { take: 1, select: { inputSnapshot: true } } } }) : null;
    return NextResponse.json({ uploads, currentUploadId: manualUploadId(run?.payslips[0]?.inputSnapshot) });
  }
  const upload = await prisma.payrollAttendanceImport.findFirst({ where: { ...where, id } });
  if (!upload) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  if (req.nextUrl.searchParams.get("download") === "1") {
    const bytes = await readPayrollWorkbook(upload.storageKey);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="attendance-original.xlsx"; filename*=UTF-8''${encodeURIComponent(upload.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  return NextResponse.json({ upload: { id: upload.id, fileName: upload.fileName, sheet: upload.sheet, rows: upload.rows, reviewedRows: upload.reviewedRows, reviewedAt: upload.reviewedAt }, sheets: readAttendanceWorkbook(await readPayrollWorkbook(upload.storageKey)).SheetNames });
}
export async function POST(req: NextRequest) {
  const ctx = await context(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData(); const file = form.get("file");
      if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || !file.size || file.size > 10_000_000) throw new Error("Upload an .xlsx workbook up to 10 MB.");
      const bytes = Buffer.from(await file.arrayBuffer()); const workbook = readAttendanceWorkbook(bytes);
      const storageKey = await savePayrollWorkbook(bytes);
      try {
        const upload = await prisma.payrollAttendanceImport.create({ data: { tenantId: ctx.session.tenantId, locationId: ctx.locationId!, month: ctx.month, fileName: file.name.slice(0, 255), storageKey, sourceHash: createHash("sha256").update(bytes).digest("hex"), uploadedBy: ctx.session.sub } });
        return NextResponse.json({ upload: { id: upload.id, fileName: upload.fileName }, sheets: workbook.SheetNames });
      } catch (error) { await removePayrollWorkbook(storageKey); throw error; }
    }
    const body = await req.json();
    const upload = await prisma.payrollAttendanceImport.findFirst({ where: { id: String(body.id ?? ""), tenantId: ctx.session.tenantId, locationId: ctx.locationId, month: ctx.month } });
    if (!upload) throw new Error("Upload not found.");
    if (upload.reviewedAt) throw new Error("Reviewed uploads are immutable. Upload a new workbook for corrections.");
    const employees = await prisma.employee.findMany({ where: { tenantId: ctx.session.tenantId, loginOnly: false, ...employeeLocationScope(ctx.locationId) }, select: { id: true, employeeNumber: true, firstName: true, lastName: true, status: true, joiningDate: true, payMode: true } });
    const sheet = String(body.sheet ?? "");
    const rows = previewPayrollAttendance(readAttendanceWorkbook(await readPayrollWorkbook(upload.storageKey)), sheet, ctx.month, employees);
    const monthStart = new Date(`${ctx.month}-01T00:00:00+05:30`);
    const monthEnd = new Date(`${nextPayrollMonth(ctx.month)}-01T00:00:00+05:30`);
    const approvedLeaves = await prisma.leaveRequest.findMany({ where: { tenantId: ctx.session.tenantId, employeeId: { in: rows.flatMap(row => row.employeeId ? [row.employeeId] : []) }, status: "approved", fromDate: { lt: monthEnd }, toDate: { gte: monthStart } }, select: { employeeId: true } });
    for (const row of rows) if (approvedLeaves.some(leave => leave.employeeId === row.employeeId)) row.issues.push("PeopleNexa has approved leave in this month. Verify it against this worksheet; manual L days remain unpaid.");
    const updated = await prisma.payrollAttendanceImport.updateMany({ where: { id: upload.id, reviewedAt: null }, data: { sheet, rows } });
    if (!updated.count) throw new Error("This upload has already been reviewed.");
    return NextResponse.json({ rows });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read workbook." }, { status: 400 }); }
}
export async function PATCH(req: NextRequest) {
  const ctx = await context(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const body = await req.json();
    if (!Array.isArray(body.decisions)) throw new Error("Review decisions are required.");
    if (body.confirmScope !== true) throw new Error("Confirm the worksheet belongs to the selected payroll month and location.");
    const upload = await prisma.payrollAttendanceImport.findFirst({ where: { id: String(body.id ?? ""), tenantId: ctx.session.tenantId, locationId: ctx.locationId, month: ctx.month } });
    if (!upload?.rows || upload.reviewedAt) throw new Error("Preview an unreviewed upload first.");
    const rows = reviewAttendanceRows(upload.rows as unknown as PayrollAttendanceRow[], body.decisions);
    await prisma.$transaction(async tx => {
      const locked = await tx.payrollAttendanceImport.updateMany({ where: { id: upload.id, reviewedAt: null, sheet: upload.sheet, rows: { equals: upload.rows! } }, data: { reviewedRows: rows, reviewedAt: new Date(), reviewedBy: ctx.session.sub } });
      if (locked.count !== 1) throw new Error("Preview changed. Reload and review again.");
      await tx.auditLog.create({ data: { tenantId: ctx.session.tenantId, actorId: ctx.session.sub, actorRole: ctx.session.role, action: "payroll_attendance.reviewed", entity: "PayrollAttendanceImport", entityId: upload.id, summary: `Reviewed ${rows.filter(row => !row.excluded).length} payroll attendance rows; ${rows.filter(row => row.excluded).length} excluded.`, after: { sourceHash: upload.sourceHash, sheet: upload.sheet } } });
    });
    return NextResponse.json({ reviewedRows: rows });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Review failed." }, { status: 400 }); }
}
