import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { internalEmployeeEmail, temporaryEmployeePassword, passwordError } from "@/lib/ess-login";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const supplied = (body as Record<string, unknown>).temporaryPassword;
  if (supplied !== undefined && typeof supplied !== "string") return NextResponse.json({ error: "Temporary password must be text." }, { status: 400 });
  const chosenPassword = typeof supplied === "string" ? supplied : "";
  const error = chosenPassword ? passwordError(chosenPassword) : null;
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { id } = await params;
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!employee || employee.role !== "employee" || employee.loginOnly) return NextResponse.json({ error: "Select a staff employee for ESS login." }, { status: 400 });
  if (employee.status !== "active") return NextResponse.json({ error: "Activate and assign the employee before creating ESS access." }, { status: 400 });
  if (!employee.branchId || !employee.employeeNumber) return NextResponse.json({ error: "Assign a branch and employee code first." }, { status: 400 });
  const duplicate = await prisma.employee.count({ where: { tenantId: session.tenantId, employeeNumber: { equals: employee.employeeNumber, mode: "insensitive" } } });
  if (duplicate !== 1) return NextResponse.json({ error: "Employee code is duplicated. Correct it before creating a login." }, { status: 409 });
  const temporaryPassword = chosenPassword || temporaryEmployeePassword(), password = await hashPassword(temporaryPassword);
  const email = employee.email && !employee.email.endsWith("@device.local") ? employee.email : internalEmployeeEmail(session.tenantId, id);
  const count = await prisma.$transaction(async tx => {
    const updated = await tx.employee.updateMany({ where: { id, tenantId: session.tenantId, status: "active", role: "employee", branchId: employee.branchId, employeeNumber: employee.employeeNumber, sessionVersion: employee.sessionVersion }, data: { email, password, mustChangePassword: true, sessionVersion: { increment: 1 } } });
    if (updated.count) await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "employee.ess.credentials.reset", entity: "Employee", entityId: id, summary: `ESS temporary password issued for ${employee.firstName} ${employee.lastName} (${employee.employeeNumber}); password change required` } });
    return updated.count;
  });
  if (!count) return NextResponse.json({ error: "Employee changed. Refresh and retry." }, { status: 409 });
  return NextResponse.json({ employeeNumber: employee.employeeNumber, temporaryPassword }, { headers: { "Cache-Control": "no-store" } });
}
