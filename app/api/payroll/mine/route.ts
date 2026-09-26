import { NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { documentSnapshotForResponse } from "@/lib/payslip-document";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: session.sub, tenantId: session.tenantId, status: { in: ["finalized", "paid"] } },
    orderBy: { month: "desc" },
  });

  // Never serialize private inputSnapshot (bank instructions, IFSC, Aadhaar).
  return NextResponse.json({ payslips: payslips.map(({ inputSnapshot: _inputSnapshot, documentSnapshot, ...slip }) => ({ ...slip, document: documentSnapshotForResponse(documentSnapshot) })) });
}
