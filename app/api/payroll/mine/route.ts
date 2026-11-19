import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { documentSnapshotForResponse } from "@/lib/payslip-document";
import { personalPayslipStatus, personalPayslipWhere } from "@/lib/personal-payslips";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role === "superadmin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payslips = await prisma.payslip.findMany({
    where: personalPayslipWhere(session.tenantId, session.sub),
    orderBy: [{ month: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    include: { payrollRun: { select: { status: true } } },
  });

  // Never serialize private inputSnapshot (bank instructions, IFSC, Aadhaar).
  return NextResponse.json({ payslips: payslips.map(({ inputSnapshot: _inputSnapshot, documentSnapshot, payrollRun, ...slip }) => ({ ...slip, status: personalPayslipStatus(slip.status, payrollRun?.status), document: documentSnapshotForResponse(documentSnapshot) })) });
}
