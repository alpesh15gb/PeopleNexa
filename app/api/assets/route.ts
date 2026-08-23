import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const STATUSES = new Set(["available", "assigned", "maintenance", "retired", "lost"]);
const INITIAL_STATUSES = new Set(["available", "maintenance", "retired", "lost"]);
const CATEGORIES = new Set(["laptop", "phone", "id_card", "vehicle", "device", "furniture", "other"]);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;
  if (status && !STATUSES.has(status)) return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  if (category && !CATEGORIES.has(category)) return NextResponse.json({ error: "Invalid category filter." }, { status: 400 });

  const assets = await prisma.asset.findMany({
    where: {
      tenantId: session.tenantId,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { tag: { contains: q, mode: "insensitive" as const } }, { serialNumber: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    include: {
      assignments: {
        where: { returnedAt: null },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const grouped = await prisma.asset.groupBy({ by: ["status"], where: { tenantId: session.tenantId }, _count: { _all: true } });
  const counts: Record<string, number> = { total: 0, available: 0, assigned: 0, maintenance: 0, retired: 0, lost: 0 };
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    counts.total += g._count._all;
  }

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
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

    if (!name || name.length > 160) return NextResponse.json({ error: "Asset name is required and must be under 160 characters." }, { status: 400 });
    if (!CATEGORIES.has(category)) return NextResponse.json({ error: "Invalid asset category." }, { status: 400 });
    if (!INITIAL_STATUSES.has(status)) {
      return NextResponse.json({ error: "New assets cannot start as assigned. Create the asset as available, then use Assign." }, { status: 400 });
    }
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1_000_000_000)) {
      return NextResponse.json({ error: "Asset value must be a valid non-negative amount." }, { status: 400 });
    }
    if (purchaseDate && !Number.isFinite(purchaseDate.getTime())) return NextResponse.json({ error: "Invalid purchase date." }, { status: 400 });

    const asset = await prisma.asset.create({
      data: { tenantId: session.tenantId, name, category, tag, serialNumber, value, purchaseDate, status, notes },
    });
    return NextResponse.json({ success: true, asset }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "An asset with this tag already exists." }, { status: 409 });
    return NextResponse.json({ error: "Failed to create asset." }, { status: 500 });
  }
}
