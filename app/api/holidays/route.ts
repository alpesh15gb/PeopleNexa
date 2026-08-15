import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, todayKey } from "@/lib/dates";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const holidays = await prisma.holiday.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { date: "asc" },
  });
  const today = todayKey();
  const upcoming = holidays.filter((h) => fromDateKey(todayKey()) <= h.date).length;

  return NextResponse.json({ holidays, upcoming });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (!body.name || !body.date) {
      return NextResponse.json({ error: "Name and date are required." }, { status: 400 });
    }
    const date = fromDateKey(body.date);
    const holiday = await prisma.holiday.create({
      data: {
        tenantId: session.tenantId,
        name: String(body.name).trim(),
        date,
        isRecurring: Boolean(body.isRecurring),
      },
    });
    return NextResponse.json({ holiday }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create holiday." }, { status: 500 });
  }
}
