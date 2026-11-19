import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { optionalDateInput } from "@/lib/dates";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

/** GET — tasks for the tenant (admins see all grouped, employees see their own). */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const tasks = await prisma.onboardingTask.findMany({
    where: {
      tenantId: session.tenantId,
      ...(locationId ? { employee: employeeLocationScope(locationId) } : session.role !== "admin" ? { employeeId: session.sub } : {}),
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: [{ employeeId: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ tasks });
}

/** POST — create onboarding tasks within the administrator's employee scope. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireActiveSession().catch(() => null);
    if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    const locationId = await managerLocationId(session);
    if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    const inputNames: unknown[] = Array.isArray(body?.names) ? body.names : typeof body?.names === "string" ? body.names.split("\n") : [];
    if (!inputNames.every((name): name is string => typeof name === "string")) return NextResponse.json({ error: "Task names must be text." }, { status: 400 });
    const names = inputNames.map((name) => name.trim()).filter(Boolean);
    if (!employeeId) return NextResponse.json({ error: "Select an employee." }, { status: 400 });
    if (names.length === 0) return NextResponse.json({ error: "Add at least one task." }, { status: 400 });
    if (names.length > 50) return NextResponse.json({ error: "Maximum 50 tasks at once." }, { status: 400 });
    if (names.some((n) => n.length > 200))
      return NextResponse.json({ error: "Each task must be 200 characters or less." }, { status: 400 });

    const dueBy = optionalDateInput(body.dueBy);
    if (dueBy === "invalid") return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId: session.tenantId, ...(locationId ? employeeLocationScope(locationId) : {}) },
        select: { status: true, loginOnly: true },
      });
      if (!employee) return { error: "Employee not found.", status: 404 } as const;
      if (employee.status !== "active" || employee.loginOnly) return { error: "Onboarding tasks require an active staff account.", status: 400 } as const;
      const { count } = await tx.onboardingTask.createMany({
        data: [...new Set(names)].map((name) => ({ tenantId: session.tenantId, employeeId, name, status: "pending", dueBy, createdBy: session.sub })),
        skipDuplicates: true,
      });
      if (count) await tx.auditLog.create({ data: {
        tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "onboarding.assign", entity: "Employee", entityId: employeeId,
        summary: "Assigned onboarding tasks", after: { count },
      } });
      return { count } as const;
    }, { isolationLevel: "Serializable" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, created: result.count, skipped: names.length - result.count });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034") return NextResponse.json({ error: "Employee onboarding changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ error: "Failed to create tasks." }, { status: 500 });
  }
}
