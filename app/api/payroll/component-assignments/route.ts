import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { payrollPolicyDraft } from "@/lib/configuration";
import { employeeLocationScope } from "@/lib/location-scope";
import { normalizePayrollComponentCode } from "@/lib/payroll-component-assignments";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const PAGE_SIZE = 20;

async function assignmentContext(tenantId: string, locationId: string, componentCode: string) {
  const [location, records] = await Promise.all([
    prisma.location.findFirst({ where: { id: locationId, tenantId, isActive: true }, select: { id: true, name: true } }),
    prisma.configurationRecord.findMany({
      where: { tenantId, kind: "payroll_policy", OR: [{ locationId }, { locationId: null }] },
      select: { payload: true },
    }),
  ]);
  const component = records
    .flatMap((record) => payrollPolicyDraft(record.payload)?.components ?? [])
    .find((candidate) => candidate.code === componentCode && candidate.applicability === "assigned_employees");
  return location && component ? { location, component } : null;
}

export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const locationId = request.nextUrl.searchParams.get("locationId")?.trim() ?? "";
  const componentCode = normalizePayrollComponentCode(request.nextUrl.searchParams.get("componentCode"));
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  if (!locationId || !componentCode) return NextResponse.json({ error: "Location and component code are required." }, { status: 400 });
  const context = await assignmentContext(session.tenantId, locationId, componentCode);
  if (!context) return NextResponse.json({ error: "Save this selected-employee component in a policy for the chosen location before managing assignments." }, { status: 404 });

  const searchScope = search ? { OR: [
    { employeeNumber: { contains: search, mode: "insensitive" as const } },
    { firstName: { contains: search, mode: "insensitive" as const } },
    { lastName: { contains: search, mode: "insensitive" as const } },
  ] } : {};
  const where: Prisma.EmployeeWhereInput = {
    tenantId: session.tenantId,
    status: "active",
    loginOnly: false,
    AND: [employeeLocationScope(locationId), searchScope],
  };
  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        payrollComponentAssignments: {
          where: { tenantId: session.tenantId, locationId, componentCode, active: true },
          orderBy: { effectiveFrom: "desc" },
          select: { id: true, effectiveFrom: true, effectiveTo: true, active: true, createdAt: true },
        },
      },
      orderBy: [{ employeeNumber: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return NextResponse.json({
    location: context.location,
    component: { code: context.component.code, label: context.component.label },
    employees,
    pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
  });
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" ? body.locationId.trim() : "";
  const componentCode = normalizePayrollComponentCode(body.componentCode);
  const rawEmployeeIds: unknown[] = Array.isArray(body.employeeIds) ? body.employeeIds : [];
  const employeeIds: string[] = [...new Set(rawEmployeeIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))];
  const effectiveFromKey = typeof body.effectiveFrom === "string" ? body.effectiveFrom : "";
  const effectiveToKey = typeof body.effectiveTo === "string" && body.effectiveTo ? body.effectiveTo : null;
  if (!locationId || !componentCode || employeeIds.length === 0 || employeeIds.length > 100) return NextResponse.json({ error: "Choose 1 to 100 employees, one location, and a valid component." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromKey) || effectiveToKey && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveToKey) || effectiveToKey < effectiveFromKey)) return NextResponse.json({ error: "Provide a valid effective date range." }, { status: 400 });
  const effectiveFrom = new Date(`${effectiveFromKey}T12:00:00.000Z`);
  const effectiveTo = effectiveToKey ? new Date(`${effectiveToKey}T12:00:00.000Z`) : null;
  const context = await assignmentContext(session.tenantId, locationId, componentCode);
  if (!context) return NextResponse.json({ error: "The selected-employee component is not configured for this location." }, { status: 404 });

  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, id: { in: employeeIds }, status: "active", loginOnly: false, AND: [employeeLocationScope(locationId)] },
    select: { id: true, employeeNumber: true },
  });
  if (employees.length !== employeeIds.length) return NextResponse.json({ error: "Every selected employee must be active and belong to the selected location." }, { status: 400 });

  try {
    const assignments = await prisma.$transaction(async (tx) => {
      const overlaps = await tx.payrollComponentAssignment.findMany({
        where: {
          tenantId: session.tenantId,
          locationId,
          componentCode,
          employeeId: { in: employeeIds },
          active: true,
          effectiveFrom: { lte: effectiveTo ?? new Date("9999-12-31T12:00:00.000Z") },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        select: { employeeId: true },
      });
      if (overlaps.length) throw new Error(`OVERLAP:${overlaps.map((assignment) => assignment.employeeId).join(",")}`);
      const created = [];
      for (const employeeId of employeeIds) {
        created.push(await tx.payrollComponentAssignment.create({ data: { tenantId: session.tenantId, locationId, employeeId, componentCode, effectiveFrom, effectiveTo, createdBy: session.sub } }));
      }
      await tx.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorId: session.sub,
          actorRole: session.role,
          action: "payroll_component_assignment.create",
          entity: "PayrollComponentAssignment",
          entityId: created.length === 1 ? created[0].id : `batch:${created[0].id}`,
          summary: `Assigned payroll component ${componentCode} to ${created.length} employee(s) in ${context.location.name}`,
          after: { locationId, componentCode, employeeIds, effectiveFrom: effectiveFrom.toISOString(), effectiveTo: effectiveTo?.toISOString() ?? null, assignmentIds: created.map((assignment) => assignment.id) },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ assignments }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = (error as { code?: string }).code;
    if (message.startsWith("OVERLAP:") || message.includes("PayrollComponentAssignment_no_active_overlap") || code === "P2002" || code === "P2004" || code === "P2034") {
      return NextResponse.json({ error: "An active assignment already overlaps this date range for one or more selected employees." }, { status: 409 });
    }
    throw error;
  }
}
