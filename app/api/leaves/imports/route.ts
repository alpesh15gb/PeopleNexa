import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { appendAudit } from "@/lib/audit";
import { KEYSTONE_MANIPUR_2026_LEAVE_LEDGER, parseKeystoneLeaveLedger } from "@/lib/leave-balance-import";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

async function adminSession() {
  const session = await requireActiveSession().catch(() => null);
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  const session = await adminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batches = await prisma.leaveBalanceImportBatch.findMany({
    where: { tenantId: session.tenantId },
    include: { leaveType: { select: { name: true, code: true } }, _count: { select: { entries: true } } },
    orderBy: { importedAt: "desc" },
  });
  return NextResponse.json({ batches });
}

export async function POST(request: NextRequest) {
  const session = await adminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const leaveTypeId = String(form?.get("leaveTypeId") ?? "");
  const throughMonth = String(form?.get("throughMonth") ?? "");
  const confirm = form?.get("confirm") === "true";
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "Choose the .xlsx leave ledger." }, { status: 400 });
  const leaveType = await prisma.leaveType.findFirst({ where: { id: leaveTypeId, tenantId: session.tenantId }, select: { id: true, name: true, code: true } });
  if (!leaveType) return NextResponse.json({ error: "Choose a leave type in this tenant." }, { status: 400 });

  const bytes = await file.arrayBuffer();
  let ledger;
  try { ledger = await parseKeystoneLeaveLedger(bytes, throughMonth); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read this workbook." }, { status: 400 }); }
  const sourceHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const employeeNumbers = [...new Set(ledger.rows.map((row) => row.employeeNumber.toLocaleLowerCase()))];
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, employeeNumber: { in: employeeNumbers }, status: "active", loginOnly: false },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, branch: { select: { locationId: true } } },
  });
  const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNumber.toLocaleLowerCase(), employee]));
  const matchedIds = employees.map((employee) => employee.id);
  const [existingEntries, policyBalances, idempotentBatch] = await Promise.all([
    prisma.leaveBalanceImportEntry.findMany({ where: { tenantId: session.tenantId, leaveTypeId, employeeId: { in: matchedIds }, periodEnd: ledger.periodEnd }, select: { employeeId: true, openingBalance: true, workedDays: true, credited: true, availed: true, available: true, batchId: true } }),
    prisma.leavePolicyBalance.findMany({ where: { tenantId: session.tenantId, leaveTypeId, employeeId: { in: matchedIds }, policyPeriod: { effectiveFrom: { lte: ledger.periodEnd }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: ledger.periodEnd } }] } }, select: { employeeId: true } }),
    prisma.leaveBalanceImportBatch.findUnique({ where: { tenantId_sourceHash_leaveTypeId_throughMonth: { tenantId: session.tenantId, sourceHash, leaveTypeId, throughMonth } } }),
  ]);
  const entryByEmployee = new Map(existingEntries.map((entry) => [entry.employeeId, entry]));
  const allocatedEmployees = new Set(policyBalances.map((entry) => entry.employeeId));
  const previewRows = ledger.rows.map((row) => {
    const employee = employeeByNumber.get(row.employeeNumber.toLocaleLowerCase());
    const validation = [...row.errors];
    let status: "ready" | "unmatched" | "conflict" | "policy_conflict" = "ready";
    if (!employee) { status = "unmatched"; validation.push("Employee code was not found among active, non-login employees in this tenant."); }
    else if (allocatedEmployees.has(employee.id)) { status = "policy_conflict"; validation.push("A policy-period allocation already covers this leave type and cutoff. It will not be changed by this import."); }
    else {
      const existing = entryByEmployee.get(employee.id);
      if (existing && !sameValues(existing, row)) { status = "conflict"; validation.push("A different immutable snapshot already exists for this employee, leave type, and cutoff."); }
    }
    return { ...row, employee: employee ? { id: employee.id, employeeNumber: employee.employeeNumber, name: `${employee.firstName} ${employee.lastName}`, locationId: employee.branch?.locationId ?? null } : null, status, errors: validation };
  });
  const summary = {
    total: previewRows.length,
    ready: previewRows.filter((row) => row.status === "ready" && !row.errors.length).length,
    unmatched: previewRows.filter((row) => row.status === "unmatched").length,
    conflicts: previewRows.filter((row) => row.status === "conflict" || row.status === "policy_conflict").length,
    invalid: previewRows.filter((row) => row.errors.length && row.status === "ready").length,
    openingBalance: previewRows.reduce((sum, row) => sum + row.openingBalance, 0),
    credited: previewRows.reduce((sum, row) => sum + row.credited, 0),
    availed: previewRows.reduce((sum, row) => sum + row.availed, 0),
    available: previewRows.reduce((sum, row) => sum + row.available, 0),
  };
  const blocking = ledger.errors.length > 0 || previewRows.some((row) => row.status !== "ready" || row.errors.length > 0);
  if (!confirm) return NextResponse.json({ profile: KEYSTONE_MANIPUR_2026_LEAVE_LEDGER, sourceHash, periodEnd: ledger.periodEnd, idempotentBatchId: idempotentBatch?.id ?? null, blocking, workbookErrors: ledger.errors, summary, rows: previewRows.slice(0, 100), truncatedRows: Math.max(0, previewRows.length - 100) });
  if (idempotentBatch) return NextResponse.json({ batchId: idempotentBatch.id, idempotent: true });
  if (blocking) return NextResponse.json({ error: "The preview contains unmatched employees, conflicts, or validation errors. Nothing was imported." }, { status: 409 });

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.leaveBalanceImportBatch.create({ data: { tenantId: session.tenantId, leaveTypeId, schemaProfile: KEYSTONE_MANIPUR_2026_LEAVE_LEDGER, sourceFileName: file.name, sourceHash, throughMonth, periodEnd: ledger.periodEnd, importedBy: session.sub } });
      await tx.leaveBalanceImportEntry.createMany({ data: previewRows.map((row) => ({ batchId: created.id, tenantId: session.tenantId, employeeId: row.employee!.id, leaveTypeId, employeeNumber: row.employee!.employeeNumber, sourceRow: row.sourceRow, openingBalance: row.openingBalance, workedDays: row.workedDays, credited: row.credited, availed: row.availed, available: row.available, periodEnd: ledger.periodEnd })) });
      return created;
    }, { isolationLevel: "Serializable" });
    await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "leave_balance_import.create", entity: "LeaveBalanceImportBatch", entityId: batch.id, summary: `Imported ${summary.ready} ${leaveType.code} balance snapshots through ${throughMonth}`, after: { schemaProfile: KEYSTONE_MANIPUR_2026_LEAVE_LEDGER, sourceHash, throughMonth, leaveTypeId, rows: summary.ready, totals: summary } });
    return NextResponse.json({ batchId: batch.id, idempotent: false }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" || (error as { code?: string }).code === "P2034") return NextResponse.json({ error: "The same cutoff was imported concurrently or now conflicts. Refresh the preview; nothing was overwritten." }, { status: 409 });
    throw error;
  }
}

function sameValues(entry: { openingBalance: number; workedDays: number; credited: number; availed: number; available: number }, row: { openingBalance: number; workedDays: number; credited: number; availed: number; available: number }) {
  return ["openingBalance", "workedDays", "credited", "availed", "available"].every((key) => Math.abs(entry[key as keyof typeof entry] - row[key as keyof typeof row]) < 0.001);
}
