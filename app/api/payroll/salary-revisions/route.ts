import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { requireActiveSession } from "@/lib/session";

async function access() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager"].includes(session.role))
    return null;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return null;
  return { session, locationId };
}

export async function GET() {
  const granted = await access();
  if (!granted)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { session, locationId } = granted;
  const revisions = await prisma.salaryRevision.findMany({
    where: {
      tenantId: session.tenantId,
      ...(locationId ? { employee: employeeLocationScope(locationId) } : {}),
    },
    include: {
      employee: {
        select: { employeeNumber: true, firstName: true, lastName: true },
      },
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ revisions });
}

export async function POST(request: NextRequest) {
  const granted = await access();
  if (!granted)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { session, locationId } = granted;
  const body = await request.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? "");
  const newSalary = Number(body.newSalary);
  const effectiveFrom = new Date(String(body.effectiveFrom ?? ""));
  if (
    !employeeId ||
    !Number.isFinite(newSalary) ||
    newSalary <= 0 ||
    Number.isNaN(effectiveFrom.getTime())
  )
    return NextResponse.json(
      {
        error:
          "Employee, positive monthly base, and effective date are required.",
      },
      { status: 400 },
    );
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      tenantId: session.tenantId,
      status: "active",
      loginOnly: false,
      ...(locationId ? employeeLocationScope(locationId) : {}),
    },
    select: { id: true, salary: true },
  });
  if (!employee?.salary || employee.salary <= 0)
    return NextResponse.json(
      {
        error:
          "The employee has no current monthly payroll base or is outside your location.",
      },
      { status: 404 },
    );
  try {
    return await prisma.$transaction(
      async (tx) => {
        const duplicate = await tx.salaryRevision.findFirst({
          where: {
            tenantId: session.tenantId,
            employeeId,
            effectiveFrom,
            status: { in: ["draft", "submitted", "approved"] },
          },
          select: { id: true },
        });
        if (duplicate)
          return NextResponse.json(
            {
              error:
                "An active revision already exists for this employee and effective date.",
            },
            { status: 409 },
          );
        const revision = await tx.salaryRevision.create({
          data: {
            tenantId: session.tenantId,
            employeeId,
            currentSalary: employee.salary!,
            newSalary,
            effectiveFrom,
            reason: String(body.reason ?? "").trim() || null,
            createdBy: session.sub,
            status: "draft",
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: session.tenantId,
            actorId: session.sub,
            actorRole: session.role,
            action: "salary_revision.create",
            entity: "SalaryRevision",
            entityId: revision.id,
            summary: "Created salary revision draft",
            after: JSON.parse(JSON.stringify(revision)),
          },
        });
        return NextResponse.json({ revision }, { status: 201 });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034")
      return NextResponse.json(
        {
          error:
            "A salary revision was created concurrently. Refresh and try again.",
        },
        { status: 409 },
      );
    throw error;
  }
}

export async function PATCH(request: NextRequest) {
  const granted = await access();
  if (!granted)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { session, locationId } = granted;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const action = String(body.action ?? "");
  try {
    return await prisma.$transaction(
      async (tx) => {
        const revision = await tx.salaryRevision.findFirst({
          where: {
            id,
            tenantId: session.tenantId,
            ...(locationId
              ? { employee: employeeLocationScope(locationId) }
              : {}),
          },
        });
        if (!revision)
          return NextResponse.json(
            { error: "Salary revision not found." },
            { status: 404 },
          );
        if (action === "submit" && revision.status === "draft") {
          const next = await tx.salaryRevision.updateMany({
            where: { id, tenantId: session.tenantId, status: revision.status },
            data: { status: "submitted", submittedAt: new Date() },
          });
          if (next.count !== 1)
            return NextResponse.json(
              { error: "The salary revision changed. Refresh and try again." },
              { status: 409 },
            );
          const updated = await tx.salaryRevision.findUnique({ where: { id } });
          await tx.auditLog.create({
            data: {
              tenantId: session.tenantId,
              actorId: session.sub,
              actorRole: session.role,
              action: "salary_revision.submit",
              entity: "SalaryRevision",
              entityId: id,
              summary: "Submitted salary revision",
              before: JSON.parse(JSON.stringify(revision)),
              after: JSON.parse(JSON.stringify(updated)),
            },
          });
          return NextResponse.json({ revision: updated });
        }
        if (action === "approve" && session.role !== "admin")
          return NextResponse.json(
            { error: "Only an administrator can approve salary revisions." },
            { status: 403 },
          );
        if (action === "approve" && revision.status === "submitted") {
          if (revision.createdBy === session.sub)
            return NextResponse.json(
              { error: "A creator cannot approve their own salary revision." },
              { status: 403 },
            );
          const next = await tx.salaryRevision.updateMany({
            where: { id, tenantId: session.tenantId, status: revision.status },
            data: {
              status: "approved",
              reviewedBy: session.sub,
              reviewedAt: new Date(),
            },
          });
          if (next.count !== 1)
            return NextResponse.json(
              { error: "The salary revision changed. Refresh and try again." },
              { status: 409 },
            );
          const updated = await tx.salaryRevision.findUnique({ where: { id } });
          await tx.auditLog.create({
            data: {
              tenantId: session.tenantId,
              actorId: session.sub,
              actorRole: session.role,
              action: "salary_revision.approve",
              entity: "SalaryRevision",
              entityId: id,
              summary: "Approved salary revision for future draft payroll",
              before: JSON.parse(JSON.stringify(revision)),
              after: JSON.parse(JSON.stringify(updated)),
            },
          });
          return NextResponse.json({ revision: updated });
        }
        if (
          action === "cancel" &&
          ["draft", "submitted", "approved"].includes(revision.status)
        ) {
          const next = await tx.salaryRevision.updateMany({
            where: { id, tenantId: session.tenantId, status: revision.status },
            data: {
              status: "cancelled",
              cancelledBy: session.sub,
              cancelledAt: new Date(),
            },
          });
          if (next.count !== 1)
            return NextResponse.json(
              { error: "The salary revision changed. Refresh and try again." },
              { status: 409 },
            );
          const updated = await tx.salaryRevision.findUnique({ where: { id } });
          await tx.auditLog.create({
            data: {
              tenantId: session.tenantId,
              actorId: session.sub,
              actorRole: session.role,
              action: "salary_revision.cancel",
              entity: "SalaryRevision",
              entityId: id,
              summary: "Cancelled salary revision",
              before: JSON.parse(JSON.stringify(revision)),
              after: JSON.parse(JSON.stringify(updated)),
            },
          });
          return NextResponse.json({ revision: updated });
        }
        return NextResponse.json(
          { error: "That transition is not available." },
          { status: 409 },
        );
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034")
      return NextResponse.json(
        { error: "The salary revision changed. Refresh and try again." },
        { status: 409 },
      );
    throw error;
  }
}
