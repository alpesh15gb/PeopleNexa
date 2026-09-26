import { NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: session.sub, tenantId: session.tenantId, status: { in: ["finalized", "paid"] } },
    orderBy: { month: "desc" },
  });

  return NextResponse.json({ payslips });
}
