import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { renderPayslipPdf } from "@/lib/payslip-pdf";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { resolveCompanyBranding } from "@/lib/company-branding";

export const runtime = "nodejs";

const safeName = (value: string) => value.replace(/[^a-z0-9_-]/gi, "_");

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const month = req.nextUrl.searchParams.get("month") || monthKeyIST(new Date());
  if (!isMonthKey(month)) return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  const ids = [...new Set((req.nextUrl.searchParams.get("employeeIds") || "").split(",").filter(Boolean))];
  if (ids.length > 500) return NextResponse.json({ error: "Select at most 500 employees at once." }, { status: 400 });
  const [tenant, slips] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true, address: true, phone: true, email: true, profile: true } }),
    prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month, ...(ids.length ? { employeeId: { in: ids } } : {}), ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) },
      include: { employee: { select: { employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, joiningDate: true, department: { select: { name: true } }, bankName: true, accountNumber: true, ifscCode: true, pan: true, uan: true, branch: { select: { location: { select: { profile: true } } } }, location: { select: { profile: true } } } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    }),
  ]);
  if (!slips.length) return NextResponse.json({ error: "No generated payslips match this selection." }, { status: 404 });
  const pdfs = await Promise.all(slips.map(async (slip) => {
    const branding = resolveCompanyBranding(tenant, slip.employee.branch?.location ?? slip.employee.location);
    const snapshot = slip.status === "finalized" || slip.status === "paid"
      ? (slip.inputSnapshot as { employee?: { employeeNumber?: string; firstName?: string; lastName?: string; position?: string | null; joiningDate?: string | Date | null; departmentName?: string | null; pan?: string | null; uan?: string | null }; bank?: { bankName?: string | null; accountNumber?: string | null; ifscCode?: string | null } } | null)
      : null;
    const employee = snapshot?.employee ? {
      ...slip.employee,
      employeeNumber: snapshot.employee.employeeNumber ?? slip.employee.employeeNumber,
      firstName: snapshot.employee.firstName ?? slip.employee.firstName,
      lastName: snapshot.employee.lastName ?? slip.employee.lastName,
      position: snapshot.employee.position ?? slip.employee.position,
      joiningDate: snapshot.employee.joiningDate ? new Date(snapshot.employee.joiningDate) : slip.employee.joiningDate,
      department: snapshot.employee.departmentName ? { name: snapshot.employee.departmentName } : slip.employee.department,
      bankName: snapshot.bank?.bankName ?? slip.employee.bankName,
      accountNumber: snapshot.bank?.accountNumber ?? slip.employee.accountNumber,
      ifscCode: snapshot.bank?.ifscCode ?? slip.employee.ifscCode,
      pan: snapshot.employee.pan ?? slip.employee.pan,
      uan: snapshot.employee.uan ?? slip.employee.uan,
    } : slip.employee;
    return {
      name: `${safeName(slip.employee.employeeNumber)}-${safeName(`${slip.employee.firstName}-${slip.employee.lastName}`)}-${month}.pdf`,
        data: await renderPayslipPdf({ companyName: branding.companyName, companyAddress: branding.address, companyContact: branding.contact, companyLogoUrl: branding.logoUrl, month, employee, payslip: { ...slip, adjustments: Array.isArray(slip.adjustments) ? slip.adjustments as { label: string; amount: number }[] : null, salaryBreakdown: Array.isArray(slip.salaryBreakdown) ? slip.salaryBreakdown as { label: string; amount: number; kind: "earning" | "deduction"; includeInGross: boolean; visibleOnPayslip: boolean }[] : null, adjustmentEarnings: 0 } }),
    };
  }));
  if (pdfs.length === 1) return new NextResponse(new Uint8Array(pdfs[0].data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdfs[0].name}"` } });
  const zip = new JSZip(); pdfs.forEach((pdf) => zip.file(pdf.name, pdf.data));
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new NextResponse(new Uint8Array(content), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="payslips-${month}.zip"` } });
}
