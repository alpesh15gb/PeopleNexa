import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey } from "@/lib/dates";

/** GET — tasks for the tenant (admins see all grouped, employees see their own). */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tasks = await prisma.onboardingTask.findMany({
    where: {
      tenantId: session.tenantId,
      ...(session.role !== "admin" ? { employeeId: session.sub } : {}),
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: [{ employeeId: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ tasks });
}

const DEFAULT_TASKS = [
  "Submit PAN card",
  "Submit Aadhaar card",
  "Open & verify bank account",
  "Share bank account details (bank file)",
  "Provide joining documents (offer letter, education certs)",
  "Issue ID card / access badge",
  "Assign laptop & assets",
  "Add to company WhatsApp / HR group",
  "Set up payroll & statutory (PF/ESIC) enrollment",
  "Complete first-day orientation & policy acknowledgement",
];

/** POST — create onboarding tasks (admin only). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireActiveSession().catch(() => null);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const employeeId = String(body.employeeId ?? "");
    const names: string[] = Array.isArray(body.names)
      ? body.names.map((s: unknown) => String(s ?? "").trim()).filter(Boolean)
      : typeof body.names === "string"
        ? body.names.split("\n").map((s: string) => s.trim()).filter(Boolean)
        : [];
    if (!employeeId) return NextResponse.json({ error: "Select an employee." }, { status: 400 });
    if (names.length === 0) return NextResponse.json({ error: "Add at least one task." }, { status: 400 });
    if (names.length > 50) return NextResponse.json({ error: "Maximum 50 tasks at once." }, { status: 400 });
    if (names.some((n) => n.length > 200))
      return NextResponse.json({ error: "Each task must be 200 characters or less." }, { status: 400 });

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId: session.tenantId },
      select: { id: true, status: true },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    if (employee.status !== "active")
      return NextResponse.json({ error: "Cannot assign tasks to an inactive employee." }, { status: 400 });

    let dueBy: Date | null = null;
    if (body.dueBy) {
      dueBy = fromDateKey(String(body.dueBy));
      if (Number.isNaN(dueBy.getTime())) return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    }
    const existing = await prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId, employeeId, name: { in: names } },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((task) => task.name));
    const newNames = names.filter((name) => !existingNames.has(name));
    if (newNames.length === 0) return NextResponse.json({ success: true, created: 0, skipped: names.length });
    const created = await prisma.onboardingTask.createMany({
      data: newNames.map((name) => ({
        tenantId: session.tenantId,
        employeeId,
        name,
        status: "pending",
        dueBy,
        createdBy: session.sub,
      })),
      skipDuplicates: true,
    });
    return NextResponse.json({ success: true, created: created.count, skipped: names.length - created.count });
  } catch {
    return NextResponse.json({ error: "Failed to create tasks." }, { status: 500 });
  }
}

/** Template helper for the UI. */
export { DEFAULT_TASKS };
