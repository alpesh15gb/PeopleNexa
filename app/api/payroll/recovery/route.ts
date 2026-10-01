import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { configurationEffectiveAtISTDay, payrollPolicyDraft, resolveConfiguration } from "@/lib/configuration";
import { employeeLocationScope, payrollOperationLocationId } from "@/lib/location-scope";
import { payrollMonthAnchor, payrollMonthEnd } from "@/lib/payroll-component-assignments";
import { isFinalizedInOnlyDay, recoveredMissingOutStatus } from "@/lib/payroll-recovery";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

type RecoveryAction = "mess_backdate" | "attendance_reprocess";

function month(value: unknown): string | null { return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null; }

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action: RecoveryAction | null = body.action === "mess_backdate" || body.action === "attendance_reprocess" ? body.action : null;
  const payrollMonth = month(body.month);
  const scope = await payrollOperationLocationId(session, typeof body.locationId === "string" ? body.locationId : null);
  if (!action || !payrollMonth || "error" in scope) return NextResponse.json({ error: "Choose a valid recovery action, location, and payroll month." }, { status: 400 });
  const locked = await prisma.payrollRun.findFirst({ where: { tenantId: session.tenantId, locationId: scope.locationId, month: payrollMonth, status: { in: ["finalized", "paid"] } }, select: { id: true, status: true } });
  if (locked) return NextResponse.json({ error: `${payrollMonth} has a ${locked.status} payroll run and cannot be changed.` }, { status: 409 });
  const apply = body.confirm === true;
  const start = payrollMonthAnchor(payrollMonth);
  const end = payrollMonthEnd(payrollMonth);

  if (action === "mess_backdate") {
    const policies = await prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "payroll_policy", active: true, OR: [{ locationId: scope.locationId }, { locationId: null }] }, select: { payload: true } });
    const messCodes = new Set(policies.flatMap((record) => payrollPolicyDraft(record.payload)?.components ?? []).filter((component) => component.applicability === "assigned_employees" && /mess/i.test(`${component.code} ${component.label}`)).map((component) => component.code));
    // The legacy workbook importer gave an assignment its import-day effective
    // date. Limit recovery to that precise signal, while allowing an older
    // import to be repaired for the selected historical payroll month.
    const candidates = messCodes.size ? await prisma.payrollComponentAssignment.findMany({ where: { tenantId: session.tenantId, locationId: scope.locationId, componentCode: { in: [...messCodes] }, active: true, effectiveTo: null, effectiveFrom: { gt: end } }, include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } }, orderBy: { effectiveFrom: "asc" } }) : [];
    const legacyImported = candidates.filter((candidate) => candidate.createdAt.getUTCFullYear() === candidate.effectiveFrom.getUTCFullYear() && candidate.createdAt.getUTCMonth() === candidate.effectiveFrom.getUTCMonth() && candidate.createdAt.getUTCDate() === candidate.effectiveFrom.getUTCDate());
    const candidateCounts = new Map<string, number>(); for (const candidate of legacyImported) candidateCounts.set(candidate.employeeId, (candidateCounts.get(candidate.employeeId) ?? 0) + 1);
    const sameMonthAssignments = legacyImported.length ? await prisma.payrollComponentAssignment.findMany({ where: { tenantId: session.tenantId, locationId: scope.locationId, employeeId: { in: legacyImported.map((candidate) => candidate.employeeId) }, componentCode: { in: [...messCodes] }, active: true, effectiveFrom: { gte: start, lte: end } }, select: { id: true, employeeId: true } }) : [];
    const eligible = legacyImported.filter((candidate) => candidateCounts.get(candidate.employeeId) === 1 && !sameMonthAssignments.some((row) => row.employeeId === candidate.employeeId && row.id !== candidate.id));
    if (!apply) return NextResponse.json({ action, month: payrollMonth, count: eligible.length, records: eligible.map((row) => ({ id: row.id, employee: `${row.employee.firstName} ${row.employee.lastName}`.trim(), employeeNumber: row.employee.employeeNumber, componentCode: row.componentCode, from: row.effectiveFrom })) });
    await prisma.$transaction(async (tx) => {
      for (const assignment of eligible) {
        const group = await tx.payrollComponentAssignment.findMany({ where: { tenantId: session.tenantId, locationId: scope.locationId, employeeId: assignment.employeeId, componentCode: { in: [...messCodes] }, active: true }, orderBy: { effectiveFrom: "asc" } });
        const future = group.find((row) => row.id !== assignment.id && row.effectiveFrom > end);
        const previous = group.filter((row) => row.id !== assignment.id && row.effectiveFrom < start && (!row.effectiveTo || row.effectiveTo >= start));
        for (const row of previous) await tx.payrollComponentAssignment.update({ where: { id: row.id }, data: { effectiveTo: new Date(start.getTime() - 24 * 60 * 60 * 1000) } });
        const updated = await tx.payrollComponentAssignment.update({ where: { id: assignment.id }, data: { effectiveFrom: start, effectiveTo: future ? new Date(future.effectiveFrom.getTime() - 24 * 60 * 60 * 1000) : assignment.effectiveTo } });
        await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "payroll_recovery.mess_backdate", entity: "PayrollComponentAssignment", entityId: assignment.id, summary: `Recovered legacy Mess assignment to ${payrollMonth}`, before: { effectiveFrom: assignment.effectiveFrom.toISOString() }, after: { effectiveFrom: updated.effectiveFrom.toISOString(), effectiveTo: updated.effectiveTo?.toISOString() ?? null, previousAssignmentIds: previous.map((row) => row.id), futureAssignmentId: future?.id ?? null } } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ action, changed: eligible.length });
  }

  const attendance = await prisma.attendance.findMany({ where: { tenantId: session.tenantId, date: { gte: start, lte: end }, employee: { AND: [employeeLocationScope(scope.locationId)] } }, include: { employee: { select: { branch: { select: { locationId: true } } } } } });
  const policies = await prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: "payroll_policy", active: true }, select: { id: true, locationId: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true } });
  const changes = attendance.flatMap((record) => {
    if (!isFinalizedInOnlyDay(record)) return [];
    const policy = resolveConfiguration(policies.filter((candidate) => payrollPolicyDraft(candidate.payload)), scope.locationId, configurationEffectiveAtISTDay(record.date));
    const treatment = payrollPolicyDraft(policy?.payload)?.attendanceTreatment.missingOutPunch ?? "review";
    const status = recoveredMissingOutStatus(treatment, record.status);
    return status === record.status ? [] : [{ record, treatment, status }];
  });
  if (!apply) return NextResponse.json({ action, month: payrollMonth, count: changes.length, records: changes.map(({ record, treatment, status }) => ({ id: record.id, date: record.date, from: record.status, to: status, treatment })) });
  await prisma.$transaction(async (tx) => { for (const change of changes) { const updated = await tx.attendance.update({ where: { id: change.record.id }, data: { status: change.status, note: `Recovered under ${change.treatment} IN-only attendance policy` } }); await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "payroll_recovery.attendance_reprocess", entity: "Attendance", entityId: updated.id, summary: `Reprocessed finalized IN-only attendance for ${payrollMonth}`, before: { status: change.record.status, reviewStatus: change.record.reviewStatus }, after: { status: updated.status, reviewStatus: updated.reviewStatus, treatment: change.treatment } } }); } }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return NextResponse.json({ action, changed: changes.length });
}
