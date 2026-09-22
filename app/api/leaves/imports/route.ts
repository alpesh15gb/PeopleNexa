import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit";
import { canConfirmLeaveBalanceImport, matchLeaveLedgerEmployee, parseKeystoneLeaveLedger, parseLeaveBalanceFlatCsv } from "@/lib/leave-balance-import";
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
  const report = form?.get("report") === "true";
  const reviewedExceptions = form?.get("reviewedExceptions") === "true";
  const acknowledgedExceptionCount = Number(form?.get("acknowledgedExceptionCount"));
  if (!(file instanceof File) || !/\.(xlsx|csv)$/i.test(file.name)) return NextResponse.json({ error: "Choose a .xlsx ledger or canonical .csv export." }, { status: 400 });
  const leaveType = await prisma.leaveType.findFirst({ where: { id: leaveTypeId, tenantId: session.tenantId }, select: { id: true, name: true, code: true } });
  if (!leaveType) return NextResponse.json({ error: "Choose a leave type in this tenant." }, { status: 400 });

  const bytes = await file.arrayBuffer();
  let ledger;
  try { ledger = /\.csv$/i.test(file.name) ? parseLeaveBalanceFlatCsv(await file.text(), throughMonth) : await parseKeystoneLeaveLedger(bytes, throughMonth); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read this workbook." }, { status: 400 }); }
  const sourceHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const employees = await prisma.employee.findMany({
    // Portal credentials are not an employment status. Keep login-only accounts
    // excluded; inactive staff are retained only to explain excluded source rows.
    where: { tenantId: session.tenantId, loginOnly: false },
    select: { id: true, employeeNumber: true, deviceCode: true, firstName: true, lastName: true, status: true, branch: { select: { locationId: true } } },
  });
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const matchedEmployees = ledger.rows.map((row) => matchLeaveLedgerEmployee(row.employeeNumber, activeEmployees));
  const inactiveMatches = ledger.rows.map((row, index) => matchedEmployees[index].kind === "unmatched" ? matchLeaveLedgerEmployee(row.employeeNumber, employees.filter((employee) => employee.status !== "active")) : null);
  const matchedIds = matchedEmployees.flatMap((match) => match.kind === "matched" ? [match.employee.id] : []);
  const [existingEntries, policyBalances, idempotentBatch] = await Promise.all([
    prisma.leaveBalanceImportEntry.findMany({ where: { tenantId: session.tenantId, leaveTypeId, employeeId: { in: matchedIds }, periodEnd: ledger.periodEnd }, select: { employeeId: true, openingBalance: true, workedDays: true, credited: true, availed: true, available: true, batchId: true } }),
    prisma.leavePolicyBalance.findMany({ where: { tenantId: session.tenantId, leaveTypeId, employeeId: { in: matchedIds }, policyPeriod: { effectiveFrom: { lte: ledger.periodEnd }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: ledger.periodEnd } }] } }, select: { employeeId: true } }),
    prisma.leaveBalanceImportBatch.findUnique({ where: { tenantId_sourceHash_leaveTypeId_throughMonth: { tenantId: session.tenantId, sourceHash, leaveTypeId, throughMonth } } }),
  ]);
  const entryByEmployee = new Map(existingEntries.map((entry) => [entry.employeeId, entry]));
  const allocatedEmployees = new Set(policyBalances.map((entry) => entry.employeeId));
  const previewRows = ledger.rows.map((row, index) => {
    const match = matchedEmployees[index];
    const validation = [...row.errors];
    let status: "ready" | "missing" | "inactive" | "ambiguous" | "reconciliation_conflict" | "policy_conflict" | "invalid" = validation.length ? "invalid" : "ready";
    if (status === "ready" && match.kind === "unmatched") {
      const inactiveMatch = inactiveMatches[index];
      if (inactiveMatch?.kind === "matched" || inactiveMatch?.kind === "ambiguous") {
        status = "inactive";
        const candidates = inactiveMatch.kind === "matched" ? [inactiveMatch.employee] : inactiveMatch.employees;
        validation.push(`Employee code belongs to inactive employee record(s): ${candidates.map((candidate) => candidate.employeeNumber).join(", ")}. Inactive employees are never imported.`);
      } else {
        status = "missing";
        validation.push("Employee code was not found in this tenant. No employee record will be created.");
      }
    }
    else if (status === "ready" && match.kind === "ambiguous") { status = "ambiguous"; validation.push(`Employee code is ambiguous among active employees in this tenant (${match.employees.map((candidate) => candidate.employeeNumber).join(", ")}). Correct the ledger code before importing.`); }
    else if (status === "ready" && match.kind === "matched") {
      if (allocatedEmployees.has(match.employee.id)) { status = "policy_conflict"; validation.push("A policy-period allocation already covers this leave type and cutoff. It will not be changed by this import."); }
      else {
        const existing = entryByEmployee.get(match.employee.id);
        if (existing) { status = "reconciliation_conflict"; validation.push(sameValues(existing, row) ? "An identical immutable snapshot already exists for this employee, leave type, and cutoff; this row will not be imported again." : "A different immutable snapshot already exists for this employee, leave type, and cutoff."); }
      }
    }
    return { ...row, employee: match.kind === "matched" ? { id: match.employee.id, employeeNumber: match.employee.employeeNumber, name: `${match.employee.firstName} ${match.employee.lastName}`, locationId: match.employee.branch?.locationId ?? null } : null, status, errors: validation };
  });
  const exceptionRows = previewRows.filter((row) => row.status !== "ready" || row.errors.length > 0);
  const summary = {
    total: previewRows.length,
    ready: previewRows.filter((row) => row.status === "ready" && !row.errors.length).length,
    excluded: exceptionRows.length,
    missing: previewRows.filter((row) => row.status === "missing").length,
    inactive: previewRows.filter((row) => row.status === "inactive").length,
    ambiguous: previewRows.filter((row) => row.status === "ambiguous").length,
    reconciliationConflicts: previewRows.filter((row) => row.status === "reconciliation_conflict").length,
    policyConflicts: previewRows.filter((row) => row.status === "policy_conflict").length,
    invalid: previewRows.filter((row) => row.status === "invalid").length,
    openingBalance: previewRows.reduce((sum, row) => sum + row.openingBalance, 0),
    credited: previewRows.reduce((sum, row) => sum + row.credited, 0),
    availed: previewRows.reduce((sum, row) => sum + row.availed, 0),
    available: previewRows.reduce((sum, row) => sum + row.available, 0),
  };
  const blocking = ledger.errors.length > 0 || previewRows.some((row) => row.status !== "ready" || row.errors.length > 0);
  if (report) {
    const csv = [
      ["source_hash", "schema_profile", "through_month", "source_row", "employee_code", "employee_name", "designation", "joining_date", "opening_balance", "worked_days", "credited", "availed", "available", "exception_category", "reason", "matched_employee_code", "matched_employee_name", "location_id"],
      ...exceptionRows.map((row) => [sourceHash, ledger.schemaProfile, throughMonth, row.sourceRow, row.employeeNumber, row.employeeName, row.designation, row.joiningDate, row.openingBalance, row.workedDays, row.credited, row.availed, row.available, row.status, row.errors.join(" | "), row.employee?.employeeNumber ?? "", row.employee?.name ?? "", row.employee?.locationId ?? ""]),
    ].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leave-balance-exceptions-${throughMonth}.csv"` } });
  }
  if (!confirm) return NextResponse.json({ profile: ledger.schemaProfile, sourceHash, periodEnd: ledger.periodEnd, idempotentBatchId: idempotentBatch?.id ?? null, blocking, workbookErrors: ledger.errors, summary, rows: previewRows.slice(0, 100), truncatedRows: Math.max(0, previewRows.length - 100) });
  if (idempotentBatch) return NextResponse.json({ batchId: idempotentBatch.id, idempotent: true });
  const confirmation = canConfirmLeaveBalanceImport({ blocking, structuralErrors: ledger.errors.length, readyCount: summary.ready, excludedCount: summary.excluded, reviewedExceptions, acknowledgedExceptionCount });
  if (!confirmation.allowed) return NextResponse.json({ error: reviewedExceptions ? `Reviewed-exceptions import requires acknowledgement of exactly ${summary.excluded} excluded rows and at least one ready row. Structural workbook errors must be resolved.` : "The preview contains exceptions. Strict import is blocked; download the exception report or explicitly choose reviewed-exceptions import." }, { status: 409 });

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const acceptedRows = previewRows.filter((row) => row.status === "ready" && row.errors.length === 0);
      const created = await tx.leaveBalanceImportBatch.create({ data: { tenantId: session.tenantId, leaveTypeId, schemaProfile: ledger.schemaProfile, sourceFileName: file.name, sourceHash, throughMonth, periodEnd: ledger.periodEnd, importedBy: session.sub, attemptedCount: summary.total, acceptedCount: acceptedRows.length, excludedCount: summary.excluded, importDecision: confirmation.decision } });
      await tx.leaveBalanceImportEntry.createMany({ data: acceptedRows.map((row) => ({ batchId: created.id, tenantId: session.tenantId, employeeId: row.employee!.id, leaveTypeId, employeeNumber: row.employee!.employeeNumber, sourceRow: row.sourceRow, openingBalance: row.openingBalance, workedDays: row.workedDays, credited: row.credited, availed: row.availed, available: row.available, periodEnd: ledger.periodEnd })) });
      return created;
    }, { isolationLevel: "Serializable" });
    await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "leave_balance_import.create", entity: "LeaveBalanceImportBatch", entityId: batch.id, summary: `${confirmation.decision === "reviewed_exceptions" ? "Reviewed exceptions; imported" : "Imported"} ${summary.ready}/${summary.total} ${leaveType.code} balance snapshots through ${throughMonth}`, after: { schemaProfile: ledger.schemaProfile, sourceHash, throughMonth, leaveTypeId, decision: confirmation.decision, attempted: summary.total, accepted: summary.ready, excluded: summary.excluded, totals: summary } });
    return NextResponse.json({ batchId: batch.id, idempotent: false }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" || (error as { code?: string }).code === "P2034") return NextResponse.json({ error: "The same cutoff was imported concurrently or now conflicts. Refresh the preview; nothing was overwritten." }, { status: 409 });
    throw error;
  }
}

function sameValues(entry: { openingBalance: number; workedDays: number; credited: number; availed: number; available: number }, row: { openingBalance: number; workedDays: number; credited: number; availed: number; available: number }) {
  return ["openingBalance", "workedDays", "credited", "availed", "available"].every((key) => Math.abs(entry[key as keyof typeof entry] - row[key as keyof typeof row]) < 0.001);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
