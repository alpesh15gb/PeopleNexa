import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** GET — flat employee list with manager links for the org chart. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "active" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      managerId: true,
      role: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: { employeeNumber: "asc" },
  });
  return NextResponse.json({ employees });
}
