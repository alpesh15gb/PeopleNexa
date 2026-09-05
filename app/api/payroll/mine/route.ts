import { NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: session.sub, tenantId: session.tenantId },
    orderBy: { month: "desc" },
  });

  return NextResponse.json({ payslips });
}
