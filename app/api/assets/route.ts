import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;

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

  return NextResponse.json({
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      tag: a.tag,
      serialNumber: a.serialNumber,
      value: a.value,
      purchaseDate: a.purchaseDate,
      status: a.status,
      notes: a.notes,
      assignee: a.assignments[0]?.employee ?? null,
    })),
    counts,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
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
    const status = String(body.status ?? "available").trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!name) {
      return NextResponse.json({ error: "Asset name is required." }, { status: 400 });
    }
    const validStatuses = ["available", "assigned", "maintenance", "retired", "lost"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const asset = await prisma.asset.create({
      data: {
        tenantId: session.tenantId,
        name,
        category,
        tag,
        serialNumber,
        value: Number.isFinite(value) ? value : null,
        purchaseDate,
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
