import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { renderPayslipPdf } from "@/lib/payslip-pdf";
import { requireActiveSession } from "@/lib/session";

export const runtime = "nodejs";

const safeName = (value: string) => value.replace(/[^a-z0-9_-]/gi, "_");

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") || monthKeyIST(new Date());
  if (!isMonthKey(month)) return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  const ids = [...new Set((req.nextUrl.searchParams.get("employeeIds") || "").split(",").filter(Boolean))];
  if (ids.length > 500) return NextResponse.json({ error: "Select at most 500 employees at once." }, { status: 400 });
  const [tenant, slips] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } }),
    prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month, ...(ids.length ? { employeeId: { in: ids } } : {}) },
      include: { employee: { select: { employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, joiningDate: true, department: { select: { name: true } }, bankName: true, accountNumber: true, ifscCode: true, pan: true, uan: true } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    }),
  ]);
  if (!slips.length) return NextResponse.json({ error: "No generated payslips match this selection." }, { status: 404 });
  const pdfs = await Promise.all(slips.map(async (slip) => ({
    name: `${safeName(slip.employee.employeeNumber)}-${safeName(`${slip.employee.firstName}-${slip.employee.lastName}`)}-${month}.pdf`,
    data: await renderPayslipPdf({ companyName: tenant?.name ?? "Company", month, employee: slip.employee, payslip: { ...slip, adjustments: Array.isArray(slip.adjustments) ? slip.adjustments as { label: string; amount: number }[] : null, adjustmentEarnings: 0 } }),
  })));
  if (pdfs.length === 1) return new NextResponse(new Uint8Array(pdfs[0].data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdfs[0].name}"` } });
  const zip = new JSZip(); pdfs.forEach((pdf) => zip.file(pdf.name, pdf.data));
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new NextResponse(new Uint8Array(content), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="payslips-${month}.zip"` } });
}
