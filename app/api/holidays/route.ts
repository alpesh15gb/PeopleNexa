import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { optionalDateInput } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [tenant, holidays] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId }, orderBy: { date: "asc" } }),
  ]);
  const { timeZone } = workspaceRegion(tenant?.config);
  const today = dateKeyInTimeZone(new Date(), timeZone);
  const upcoming = holidays.filter((holiday) => holiday.isRecurring || istDateKey(holiday.date) >= today).length;

  return NextResponse.json({ holidays, upcoming });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (!body.name || !body.date) {
      return NextResponse.json({ error: "Name and date are required." }, { status: 400 });
    }
    const date = optionalDateInput(body.date);
    if (!date || date === "invalid") {
      return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
    }
    const holiday = await prisma.holiday.create({
      data: {
        tenantId: session.tenantId,
        name: String(body.name).trim(),
        date,
        isRecurring: Boolean(body.isRecurring),
        isHalfDay: Boolean(body.isHalfDay),
      },
    });
    return NextResponse.json({ holiday }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create holiday." }, { status: 500 });
  }
}

/** Bulk import holidays: [{ name, date, isRecurring?, isHalfDay? }] */
export async function PUT(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0 || rows.length > 200) {
      return NextResponse.json({ error: "Provide 1–200 holiday rows." }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const name = String(row.name ?? "").trim();
      const date = optionalDateInput(row.date);
      if (!name || !date || date === "invalid") {
        skipped++;
        continue;
      }
      const exists = await prisma.holiday.findFirst({
        where: { tenantId: session.tenantId, date },
      });
      if (exists) {
        skipped++;
        continue;
      }
      await prisma.holiday.create({
        data: {
          tenantId: session.tenantId,
          name,
          date,
          isRecurring: Boolean(row.isRecurring),
          isHalfDay: Boolean(row.isHalfDay),
        },
      });
      created++;
    }
    return NextResponse.json({ created, skipped });
  } catch {
    return NextResponse.json({ error: "Failed to import holidays." }, { status: 500 });
  }
}
