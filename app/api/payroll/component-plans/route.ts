import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { payrollPolicyDraft } from "@/lib/configuration";
import { employeeLocationScope } from "@/lib/location-scope";
import { normalizePayrollComponentCode } from "@/lib/payroll-component-assignments";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const PAGE_SIZE = 20;

function codes(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  return [...new Set(raw.map(normalizePayrollComponentCode).filter((code): code is string => Boolean(code)))];
}

async function context(tenantId: string, locationId: string, componentCodes: string[]) {
  const [location, records] = await Promise.all([
    prisma.location.findFirst({ where: { id: locationId, tenantId, isActive: true }, select: { id: true, name: true } }),
    prisma.configurationRecord.findMany({ where: { tenantId, kind: "payroll_policy", OR: [{ locationId }, { locationId: null }] }, select: { payload: true } }),
  ]);
  const candidates = records.flatMap((record) => payrollPolicyDraft(record.payload)?.components ?? []).filter((component) => componentCodes.includes(component.code) && component.applicability === "assigned_employees");
  // Older drafts can contain the same plan codes. One code represents one
  // plan, so resolve each requested code once instead of rejecting duplicates.
  const byCode = new Map(candidates.map((component) => [component.code, component]));
  const components = componentCodes.map((code) => byCode.get(code)).filter((component): component is NonNullable<typeof component> => Boolean(component));
  return location && components.length === componentCodes.length ? { location, components } : null;
}

export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const locationId = request.nextUrl.searchParams.get("locationId")?.trim() ?? "";
  const componentCodes = codes(request.nextUrl.searchParams.get("componentCodes"));
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  if (!locationId || componentCodes.length < 2) return NextResponse.json({ error: "Choose a location and at least two employee plans." }, { status: 400 });
  const planContext = await context(session.tenantId, locationId, componentCodes);
  if (!planContext) return NextResponse.json({ error: "Save all selected-employee plans in this location policy before managing employees." }, { status: 404 });
  const searchScope = search ? { OR: [{ employeeNumber: { contains: search, mode: "insensitive" as const } }, { firstName: { contains: search, mode: "insensitive" as const } }, { lastName: { contains: search, mode: "insensitive" as const } }] } : {};
  const where: Prisma.EmployeeWhereInput = { tenantId: session.tenantId, status: "active", loginOnly: false, AND: [employeeLocationScope(locationId), searchScope] };
  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, select: { id: true, employeeNumber: true, firstName: true, lastName: true, department: { select: { name: true } }, payrollComponentAssignments: { where: { tenantId: session.tenantId, locationId, componentCode: { in: componentCodes }, active: true }, orderBy: { effectiveFrom: "desc" }, select: { componentCode: true, effectiveFrom: true, effectiveTo: true } } }, orderBy: [{ employeeNumber: "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return NextResponse.json({ location: planContext.location, components: planContext.components.map((component) => ({ code: component.code, label: component.label, amount: component.amount })), employees, pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) } });
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" ? body.locationId.trim() : "";
  const componentCodes = codes(body.componentCodes);
  const effectiveFromKey = typeof body.effectiveFrom === "string" ? body.effectiveFrom : "";
  const plans: unknown[] = Array.isArray(body.plans) ? body.plans : [];
  if (!locationId || componentCodes.length < 2 || !plans.length || plans.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromKey)) return NextResponse.json({ error: "Choose valid plans, employees, and an effective date." }, { status: 400 });
  const normalized = plans.map((plan): { employeeId: string; componentCode: string | null } => {
    const value = plan && typeof plan === "object" && !Array.isArray(plan) ? plan as Record<string, unknown> : {};
    return { employeeId: typeof value.employeeId === "string" ? value.employeeId.trim() : "", componentCode: value.componentCode === null ? null : normalizePayrollComponentCode(value.componentCode) || null };
  });
  if (normalized.some((plan) => !plan.employeeId || (plan.componentCode && !componentCodes.includes(plan.componentCode))) || new Set(normalized.map((plan) => plan.employeeId)).size !== normalized.length) return NextResponse.json({ error: "Each employee must have at most one valid plan." }, { status: 400 });
  const planContext = await context(session.tenantId, locationId, componentCodes);
  if (!planContext) return NextResponse.json({ error: "The selected employee plans are not configured for this location." }, { status: 404 });
  const employees = await prisma.employee.findMany({ where: { tenantId: session.tenantId, id: { in: normalized.map((plan) => plan.employeeId) }, status: "active", loginOnly: false, AND: [employeeLocationScope(locationId)] }, select: { id: true } });
  if (employees.length !== normalized.length) return NextResponse.json({ error: "Every selected employee must be active and belong to this location." }, { status: 400 });
  const effectiveFrom = new Date(`${effectiveFromKey}T12:00:00.000Z`);
  const previousDay = new Date(effectiveFrom); previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.payrollComponentAssignment.findMany({ where: { tenantId: session.tenantId, locationId, employeeId: { in: normalized.map((plan) => plan.employeeId) }, componentCode: { in: componentCodes }, active: true, effectiveFrom: { lte: new Date("9999-12-31T12:00:00.000Z") }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }] } });
    for (const assignment of existing) await tx.payrollComponentAssignment.update({ where: { id: assignment.id }, data: assignment.effectiveFrom < effectiveFrom ? { effectiveTo: previousDay } : { active: false } });
    const created = [];
    for (const plan of normalized) if (plan.componentCode) created.push(await tx.payrollComponentAssignment.create({ data: { tenantId: session.tenantId, locationId, employeeId: plan.employeeId, componentCode: plan.componentCode, effectiveFrom, createdBy: session.sub } }));
    return { existing, created };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await prisma.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "payroll_component_plan.replace", entity: "PayrollComponentAssignment", entityId: `plans:${locationId}:${effectiveFromKey}`, summary: `Updated employee plans for ${normalized.length} employee(s) in ${planContext.location.name}`, after: { locationId, componentCodes, effectiveFrom: effectiveFrom.toISOString(), plans: normalized } } });
  return NextResponse.json({ changed: normalized.length, assignments: result.created }, { status: 201 });
}
