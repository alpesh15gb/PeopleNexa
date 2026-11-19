import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { documentAttachment } from "@/lib/document-attachment";
import { optionalDateInput } from "@/lib/dates";
import { documentSummary } from "@/lib/document-records";
import { recordApiPaging, recordPagination } from "@/lib/document-expense-pagination";

const DOC_TYPES = ["passport", "visa", "aadhaar", "pan", "license", "other"];

/** POST — admin records a document for an employee. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A document object is required." }, { status: 400 });
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const name = String(body.name ?? "").trim();
  const employeeId = String(body.employeeId ?? "");
  const docType = DOC_TYPES.includes(body.docType) ? body.docType : "other";
  const issuedDate = optionalDateInput(body.issuedDate);
  const expiryDate = optionalDateInput(body.expiryDate);
  const fileUrl = body.fileUrl ? String(body.fileUrl).trim() : null;

  if (!name) return NextResponse.json({ error: "Document name is required." }, { status: 400 });
  if (!employeeId) return NextResponse.json({ error: "Select an employee." }, { status: 400 });
  if (issuedDate === "invalid" || expiryDate === "invalid") return NextResponse.json({ error: "Enter valid issue and expiry dates." }, { status: 400 });
  if (issuedDate && expiryDate && expiryDate < issuedDate) return NextResponse.json({ error: "Expiry date must be on or after the issue date." }, { status: 400 });
  if (fileUrl && !documentAttachment(fileUrl, session.tenantId)) return NextResponse.json({ error: "Attach a PDF or supported image up to 2 MB, or enter an HTTPS link." }, { status: 400 });

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: session.tenantId, loginOnly: false, ...(locationId ? employeeLocationScope(locationId) : {}) }, select: { id: true } });
  if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const doc = await prisma.document.create({
    data: {
      tenantId: session.tenantId,
      employeeId,
      name,
      docType,
      number: body.number ? String(body.number).trim() : null,
      issuedDate,
      expiryDate,
      fileUrl,
      notes: body.notes ? String(body.notes).trim() : null,
    },
  });
  return NextResponse.json({ doc }, { status: 201 });
}

/** GET — admins see all (with expiry summary), employees see their own. */
export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const requested = recordApiPaging(request.nextUrl.searchParams, 300);
  if (!requested) return NextResponse.json({ error: "Use a positive integer page and a pageSize from 1 to 300." }, { status: 400 });
  const managerScope = locationId ? { tenantId: session.tenantId, employee: employeeLocationScope(locationId) } : null;
  const where = managerScope ?? { tenantId: session.tenantId, ...(session.role === "admin" ? {} : { employeeId: session.sub }) };
  const summary = await documentSummary(where, new Date());
  const pagination = recordPagination(summary.total, requested.page, requested.pageSize);
  const [docs, employees] = await Promise.all([
    prisma.document.findMany({
      where,
      include: (session.role === "admin" || session.role === "location_manager")
        ? { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } }
        : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.offset,
      take: pagination.pageSize,
    }),
    session.role === "admin" || session.role === "location_manager"
      ? prisma.employee.findMany({
          where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...(locationId ? employeeLocationScope(locationId) : {}) },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          orderBy: { employeeNumber: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    documents: docs.map((d) => ({ ...d, expiryDate: d.expiryDate?.toISOString() ?? null, issuedDate: d.issuedDate?.toISOString() ?? null, createdAt: d.createdAt.toISOString() })),
    employees,
    summary,
    pagination,
  });
}
