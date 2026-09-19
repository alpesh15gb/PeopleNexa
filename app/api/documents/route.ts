import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

const DOC_TYPES = ["passport", "visa", "aadhaar", "pan", "license", "other"];

export function expiryStatus(expiryDate: Date | null): "none" | "expired" | "expiring" | "ok" {
  if (!expiryDate) return "none";
  const days = Math.round((expiryDate.getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 60) return "expiring";
  return "ok";
}

/** POST — admin records a document for an employee. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const name = String(body.name ?? "").trim();
  const employeeId = String(body.employeeId ?? "");
  const docType = DOC_TYPES.includes(body.docType) ? body.docType : "other";

  if (!name) return NextResponse.json({ error: "Document name is required." }, { status: 400 });
  if (!employeeId) return NextResponse.json({ error: "Select an employee." }, { status: 400 });

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: session.tenantId, ...(locationId ? employeeLocationScope(locationId) : {}) } });
  if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const doc = await prisma.document.create({
    data: {
      tenantId: session.tenantId,
      employeeId,
      name,
      docType,
      number: body.number ? String(body.number).trim() : null,
      issuedDate: body.issuedDate ? new Date(body.issuedDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      fileUrl: body.fileUrl ? String(body.fileUrl).slice(0, 3_000_000) : null,
      notes: body.notes ? String(body.notes).trim() : null,
    },
  });
  return NextResponse.json({ doc }, { status: 201 });
}

/** GET — admins see all (with expiry summary), employees see their own. */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const managerScope = locationId ? { tenantId: session.tenantId, employee: employeeLocationScope(locationId) } : null;
  const where = managerScope ?? (session.role === "admin" ? { tenantId: session.tenantId } : { employeeId: session.sub });
  const [docs, employees] = await Promise.all([
    prisma.document.findMany({
      where,
      include: (session.role === "admin" || session.role === "location_manager")
        ? { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    session.role === "admin" || session.role === "location_manager"
      ? prisma.employee.findMany({
          where: { tenantId: session.tenantId, status: "active", ...(locationId ? employeeLocationScope(locationId) : {}) },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          orderBy: { employeeNumber: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const statuses = docs.map((d) => expiryStatus(d.expiryDate));
  const summary = {
    total: docs.length,
    expired: statuses.filter((s) => s === "expired").length,
    expiring: statuses.filter((s) => s === "expiring").length,
    ok: statuses.filter((s) => s === "ok").length,
  };

  return NextResponse.json({
    documents: docs.map((d) => ({ ...d, expiryDate: d.expiryDate?.toISOString() ?? null, issuedDate: d.issuedDate?.toISOString() ?? null, createdAt: d.createdAt.toISOString() })),
    employees,
    summary,
  });
}
