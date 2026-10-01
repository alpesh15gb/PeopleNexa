import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { appendAudit } from "@/lib/audit";
import { payrollPolicyDraft } from "@/lib/configuration";
import { ensureDesignations, normalizeDesignationName } from "@/lib/designation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { previewYlrWorkbook, YLR_BRANCH_NAME, type YlrWorkbookPreview } from "@/lib/ylr-workbook-import";
import { payrollMonthAnchor } from "@/lib/payroll-component-assignments";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function workbookPreview(request: NextRequest): Promise<{ preview: YlrWorkbookPreview; error?: string }> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) return { preview: { rows: [], sheets: [], exceptions: [] }, error: "Choose an .xlsx workbook." };
  if (file.size === 0 || file.size > MAX_FILE_BYTES) return { preview: { rows: [], sheets: [], exceptions: [] }, error: "Workbook must be between 1 byte and 10 MB." };
  try { return { preview: await previewYlrWorkbook(await file.arrayBuffer()) }; }
  catch { return { preview: { rows: [], sheets: [], exceptions: [] }, error: "The workbook could not be read." }; }
}

function splitName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function employeeCodeKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function configuredMessComponents(payloads: unknown[]): Map<number, string> {
  const found = new Map<number, string>();
  for (const payload of payloads) for (const component of payrollPolicyDraft(payload)?.components ?? []) {
    if (component.applicability !== "assigned_employees" || !/mess/i.test(`${component.code} ${component.label}`)) continue;
    for (const plan of [800, 1000, 1500]) if (new RegExp(`(^|\\D)${plan}(\\D|$)`).test(`${component.code} ${component.label}`)) found.set(plan, component.code);
  }
  return found;
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const confirm = request.nextUrl.searchParams.get("confirm") === "true";
  const effectiveMonth = request.nextUrl.searchParams.get("effectiveMonth") ?? "";
  let effectiveFrom: Date;
  try { effectiveFrom = effectiveMonth ? payrollMonthAnchor(effectiveMonth) : new Date(); effectiveFrom.setUTCHours(12, 0, 0, 0); }
  catch { return NextResponse.json({ error: "Effective payroll month must use YYYY-MM." }, { status: 400 }); }
  const parsed = await workbookPreview(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { preview } = parsed;
  if (!preview.rows.length) return NextResponse.json({ error: "No active YLR payroll rows were found." }, { status: 400 });
  if (!confirm) return NextResponse.json({ preview });
  if (preview.exceptions.some((exception) => exception.includes("duplicate Emp Code"))) return NextResponse.json({ error: "The workbook contains duplicate employee codes. Resolve them in the source workbook before confirming import." }, { status: 400 });

  const importRows = preview.rows;

  const branch = await prisma.branch.findFirst({ where: { tenantId: session.tenantId, name: YLR_BRANCH_NAME }, select: { id: true, locationId: true } });
  if (!branch) return NextResponse.json({ error: `The exact branch ${YLR_BRANCH_NAME} must exist before importing.` }, { status: 400 });
  const codes = importRows.map((row) => row.employeeCode);
  const existing = await prisma.employee.findMany({ where: { tenantId: session.tenantId, OR: [{ employeeNumber: { in: codes } }, { deviceCode: { in: codes } }] } });
  const byCode = new Map<string, typeof existing[number]>();
  for (const employee of existing) {
    for (const code of [employee.employeeNumber, employee.deviceCode]) if (code) {
      const key = employeeCodeKey(code);
      if (byCode.has(key) && byCode.get(key)!.id !== employee.id) return NextResponse.json({ error: `Existing records conflict for employee code ${code}.` }, { status: 409 });
      byCode.set(key, employee);
    }
  }
  const [tenant, departments, componentRecords] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { seats: true } }),
    prisma.department.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
    branch.locationId ? prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "payroll_policy", OR: [{ locationId: branch.locationId }, { locationId: null }] }, select: { payload: true } }) : [],
  ]);
  const newRows = importRows.filter((row) => !byCode.has(employeeCodeKey(row.employeeCode)));
  const currentCount = await prisma.employee.count({ where: { tenantId: session.tenantId, loginOnly: false } });
  if (currentCount + newRows.length > (tenant?.seats ?? 0)) return NextResponse.json({ error: `Import would exceed the ${tenant?.seats ?? 0} seat limit.` }, { status: 400 });
  const departmentsByName = new Map(departments.map((department) => [department.name.toLocaleLowerCase(), department.id]));
  const messComponents = configuredMessComponents(componentRecords.map((record) => record.payload));
  const importExceptions = [...preview.exceptions];
  const created: string[] = [], updated: string[] = [], assignments: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      await ensureDesignations(tx, session.tenantId, importRows.map((row) => normalizeDesignationName(row.designation)).filter((value): value is string => Boolean(value)));
      for (const row of importRows) {
        let departmentId = departmentsByName.get(row.department.toLocaleLowerCase());
        if (!departmentId) { const department = await tx.department.create({ data: { tenantId: session.tenantId, name: row.department } }); departmentId = department.id; departmentsByName.set(row.department.toLocaleLowerCase(), department.id); }
        const current = byCode.get(employeeCodeKey(row.employeeCode));
        const name = splitName(row.name);
        const data = { firstName: name.firstName, lastName: name.lastName, position: normalizeDesignationName(row.designation), joiningDate: row.joiningDate ? new Date(`${row.joiningDate}T12:00:00.000Z`) : current?.joiningDate ?? null, salary: row.grossSalary, branchId: branch.id, departmentId };
        const employee = current ? await tx.employee.update({ where: { id: current.id }, data }) : await tx.employee.create({ data: { tenantId: session.tenantId, employeeNumber: row.employeeCode, deviceCode: row.employeeCode, ...data, email: null, password: null, role: "employee", status: "active", payMode: "monthly" } });
        (current ? updated : created).push(row.employeeCode);
        if (!row.messPlan) continue;
        const componentCode = messComponents.get(row.messPlan);
        if (!branch.locationId || !componentCode) { importExceptions.push(`${row.employeeCode}: no configured selected-employee Mess ${row.messPlan} component was found.`); continue; }
        const assigned = await tx.payrollComponentAssignment.findFirst({ where: { tenantId: session.tenantId, locationId: branch.locationId, employeeId: employee.id, componentCode, active: true, effectiveFrom: { lte: effectiveFrom }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }] }, select: { id: true } });
        if (!assigned) {
          // Keep an already-scheduled future plan intact when importing a
          // historical workbook instead of creating an overlapping open range.
          const next = await tx.payrollComponentAssignment.findFirst({ where: { tenantId: session.tenantId, locationId: branch.locationId, employeeId: employee.id, componentCode, active: true, effectiveFrom: { gt: effectiveFrom } }, orderBy: { effectiveFrom: "asc" }, select: { effectiveFrom: true } });
          const effectiveTo = next ? new Date(next.effectiveFrom.getTime() - 24 * 60 * 60 * 1000) : null;
          await tx.payrollComponentAssignment.create({ data: { tenantId: session.tenantId, locationId: branch.locationId, employeeId: employee.id, componentCode, effectiveFrom, effectiveTo, createdBy: session.sub } }); assignments.push(`${row.employeeCode}:${componentCode}`);
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "Import could not be applied because a concurrent employee change created a duplicate code. Nothing was imported." }, { status: 409 });
    throw error;
  }
  await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "employee.ylr_workbook_import", entity: "Employee", entityId: `ylr:${new Date().toISOString()}`, summary: `YLR workbook import: ${created.length} created, ${updated.length} updated, ${assignments.length} Mess assignments, ${importExceptions.length} exceptions`, after: { sourceRows: preview.rows.length, importedRows: importRows.length, sheets: preview.sheets, effectiveFrom: effectiveFrom.toISOString(), created, updated, assignments, exceptions: importExceptions } });
  return NextResponse.json({ created, updated, assignments, exceptions: importExceptions });
}
