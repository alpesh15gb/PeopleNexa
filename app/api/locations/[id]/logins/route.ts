import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const MAX_LOCATION_LOGINS = 4;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: locationId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const firstName = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!firstName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    return NextResponse.json({ error: "Enter a name, valid email, and a password of at least 12 characters." }, { status: 400 });
  }
  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: session.tenantId }, select: { id: true } });
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  const [count, duplicate, loginCount] = await Promise.all([
    prisma.employee.count({ where: { tenantId: session.tenantId, loginOnly: true } }),
    prisma.employee.findFirst({ where: { tenantId: session.tenantId, email }, select: { id: true } }),
    prisma.employee.count({ where: { tenantId: session.tenantId, locationId, loginOnly: true, role: "location_manager" } }),
  ]);
  if (duplicate) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  if (loginCount >= MAX_LOCATION_LOGINS) return NextResponse.json({ error: "A location can have at most four login accounts." }, { status: 400 });
  const employee = await prisma.employee.create({
    data: {
      tenantId: session.tenantId,
      employeeNumber: `LOC-${String(count + 1).padStart(3, "0")}`,
      firstName,
      lastName: "",
      email,
      password: await hashPassword(password),
      role: "location_manager",
      loginOnly: true,
      locationId,
    },
    select: { id: true, firstName: true, lastName: true, email: true, status: true },
  });
  return NextResponse.json({ employee }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: locationId } = await ctx.params;
  const employeeId = req.nextUrl.searchParams.get("employeeId");
  if (!employeeId) return NextResponse.json({ error: "employeeId is required." }, { status: 400 });
  const account = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId, locationId, loginOnly: true, role: "location_manager" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Location login not found." }, { status: 404 });
  await prisma.employee.update({ where: { id: account.id }, data: { status: "inactive" } });
  return NextResponse.json({ success: true });
}
