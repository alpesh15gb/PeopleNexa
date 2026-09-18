import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateIST } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;
  const format = req.nextUrl.searchParams.get("format");

  const assets = await prisma.asset.findMany({
    where: {
      tenantId: session.tenantId,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { tag: { contains: q } },
              { serialNumber: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      assignments: {
        where: { returnedAt: null },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
        take: 1,
      },
      maintenanceRecords: {
        orderBy: { performedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const grouped = await prisma.asset.groupBy({
    by: ["status"],
    where: { tenantId: session.tenantId },
    _count: { _all: true },
  });
  const counts = {
    total: assets.length,
    available: 0,
    assigned: 0,
    maintenance: 0,
    retired: 0,
    lost: 0,
  };
  for (const g of grouped) {
    if (g.status in counts) {
      (counts as Record<string, number>)[g.status] = g._count._all;
    }
  }
  counts.total = (await prisma.asset.count({ where: { tenantId: session.tenantId } }));
  if (format === "csv") {
    const quote = (value: unknown) => { const text = value == null ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    const lines = ["Asset Name,Category,Asset Tag,Serial Number,Photo URL,Value,Purchase Date,Condition,Warranty Expiry,Maintenance Due,Status,Assignee,Employee Number,Assigned Date,Last Maintenance,Last Maintenance Cost,Notes", ...assets.map((asset) => [asset.name, asset.category, asset.tag, asset.serialNumber, asset.photoUrl, asset.value, formatDateIST(asset.purchaseDate), asset.condition, formatDateIST(asset.warrantyExpiry), formatDateIST(asset.maintenanceDue), asset.status, asset.assignments[0]?.employee ? `${asset.assignments[0].employee.firstName} ${asset.assignments[0].employee.lastName}` : "", asset.assignments[0]?.employee?.employeeNumber, formatDateIST(asset.assignments[0]?.assignedAt), formatDateIST(asset.maintenanceRecords[0]?.performedAt), asset.maintenanceRecords[0]?.cost, asset.notes].map(quote).join(","))];
    return new NextResponse(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="asset-inventory-report.csv"' } });
  }

  return NextResponse.json({
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      tag: a.tag,
      serialNumber: a.serialNumber,
      photoUrl: a.photoUrl,
      value: a.value,
      purchaseDate: a.purchaseDate,
      condition: a.condition,
      warrantyExpiry: a.warrantyExpiry,
      maintenanceDue: a.maintenanceDue,
      status: a.status,
      notes: a.notes,
      assignee: a.assignments[0]?.employee ?? null,
    })),
    counts,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "other").trim();
    const tag = body.tag ? String(body.tag).trim() : null;
    const serialNumber = body.serialNumber ? String(body.serialNumber).trim() : null;
    const value = body.value !== undefined && body.value !== "" ? Number(body.value) : null;
    const purchaseDate = body.purchaseDate ? new Date(String(body.purchaseDate)) : null;
    const warrantyExpiry = body.warrantyExpiry ? new Date(String(body.warrantyExpiry)) : null;
    const maintenanceDue = body.maintenanceDue ? new Date(String(body.maintenanceDue)) : null;
    const condition = String(body.condition ?? "good").trim();
    const status = String(body.status ?? "available").trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!name) {
      return NextResponse.json({ error: "Asset name is required." }, { status: 400 });
    }
    const validStatuses = ["available", "assigned", "maintenance", "retired", "lost"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (!["new", "good", "fair", "poor", "damaged"].includes(condition)) {
      return NextResponse.json({ error: "Invalid asset condition." }, { status: 400 });
    }

    const asset = await prisma.asset.create({
      data: {
        tenantId: session.tenantId,
        name,
        category,
        tag,
        serialNumber,
        photoUrl: body.photoUrl ? String(body.photoUrl).trim() : null,
        value: Number.isFinite(value) ? value : null,
        purchaseDate,
        condition,
        warrantyExpiry: warrantyExpiry && !Number.isNaN(warrantyExpiry.getTime()) ? warrantyExpiry : null,
        maintenanceDue: maintenanceDue && !Number.isNaN(maintenanceDue.getTime()) ? maintenanceDue : null,
        status,
        notes,
      },
    });
    return NextResponse.json({ success: true, asset }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "An asset with this tag already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
