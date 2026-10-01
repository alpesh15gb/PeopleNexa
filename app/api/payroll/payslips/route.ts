import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { loadPayslipLogo, renderPayslipPdf } from "@/lib/payslip-pdf";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { resolveCompanyBranding } from "@/lib/company-branding";
import { documentSnapshotForResponse } from "@/lib/payslip-document";

export const runtime = "nodejs";

const safeName = (value: string) => value.replace(/[^a-z0-9_-]/gi, "_");
const PDF_CONCURRENCY = 4;

type PdfResult = { name: string; data: Buffer } | { error: true; employeeNumber: string };

async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager", "employee"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const month = req.nextUrl.searchParams.get("month") || monthKeyIST(new Date());
  if (!isMonthKey(month)) return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  const ids = session.role === "employee" ? [session.sub] : [...new Set((req.nextUrl.searchParams.get("employeeIds") || "").split(",").filter(Boolean))];
  const slipId = req.nextUrl.searchParams.get("id");
  const runId = req.nextUrl.searchParams.get("runId");
  if (ids.length > 500) return NextResponse.json({ error: "Select at most 500 employees at once." }, { status: 400 });
  const [tenant, slips] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true, address: true, phone: true, email: true, profile: true } }),
    prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month, ...(slipId ? { id: slipId } : {}), ...(runId ? { payrollRunId: runId } : {}), ...(ids.length ? { employeeId: { in: ids } } : {}), ...(session.role === "employee" ? { status: { in: ["finalized", "paid"] } } : {}), ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) },
      include: { employee: { select: { employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, joiningDate: true, department: { select: { name: true } }, bankName: true, accountNumber: true, ifscCode: true, pan: true, uan: true, esiIpNumber: true, branch: { select: { location: { select: { profile: true } } } }, location: { select: { profile: true } } } } },
      orderBy: { employee: { employeeNumber: "asc" } },
    }),
  ]);
  if (!slips.length) return NextResponse.json({ error: "No generated payslips match this selection." }, { status: 404 });
  // Cache promises, rather than completed values, so concurrent workers share one fetch per source.
  const logos = new Map<string, Promise<Buffer | null>>();
  const logoFor = (source: string | null | undefined) => {
    const key = source ?? "";
    let logo = logos.get(key);
    if (!logo) {
      logo = loadPayslipLogo(source);
      logos.set(key, logo);
    }
    return logo;
  };
  const pdfs = await mapWithConcurrency(slips, PDF_CONCURRENCY, async (slip): Promise<PdfResult> => {
    try {
    const branding = resolveCompanyBranding(tenant, slip.employee.branch?.location ?? slip.employee.location);
    const document = documentSnapshotForResponse(slip.documentSnapshot);
    if (document) {
      const [firstName, ...last] = document.employee.name.split(" ");
      return {
        name: `${safeName(document.employee.employeeNumber)}-${month}.pdf`,
        data: await renderPayslipPdf({
          companyName: document.branding.displayName || document.branding.legalName, companyAddress: document.branding.address, companyContact: document.branding.contact, companyLogoUrl: document.branding.logoUrl, companyLogo: await logoFor(document.branding.logoUrl), month: document.period,
          employee: { employeeNumber: document.employee.employeeNumber, deviceCode: null, firstName, lastName: last.join(" "), position: document.employee.designation, joiningDate: document.employee.joiningDate ? new Date(document.employee.joiningDate) : null, department: document.employee.department ? { name: document.employee.department } : null, bankName: document.employee.bankName, accountNumber: document.employee.accountMasked, ifscCode: null, pan: document.employee.panMasked, uan: document.employee.uan, esiIpNumber: document.employee.esiIpNumber },
          payslip: { basicSalary: 0, allowances: 0, overtimePay: 0, adjustmentEarnings: 0, grossEarnings: document.totals.gross, earnedGross: document.totals.earnedGross, pfEmployee: 0, esicEmployee: 0, professionalTax: 0, lwf: 0, tds: 0, lateFines: 0, loanDeduction: 0, absentDeduction: 0, deductions: document.totals.deductions, netSalary: document.totals.net, presentDays: document.days.paid, lateDays: 0, halfDays: 0, absentDays: document.days.lop, workingDays: document.days.payable, adjustments: null, salaryBreakdown: document.components.filter((row) => row.category === "earning" || row.category === "deduction").map((row) => ({ label: row.label, amount: row.earned, contractual: row.contractual, earned: row.earned, kind: row.category as "earning" | "deduction", includeInGross: row.includeInGross, visibleOnPayslip: row.visibleOnPayslip })) },
        }),
      };
    }
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
      name: `${safeName(employee.employeeNumber)}-${month}.pdf`,
        data: await renderPayslipPdf({ companyName: branding.companyName, companyAddress: branding.address, companyContact: branding.contact, companyLogoUrl: branding.logoUrl, companyLogo: await logoFor(branding.logoUrl), month, employee, payslip: { ...slip, adjustments: Array.isArray(slip.adjustments) ? slip.adjustments as { label: string; amount: number }[] : null, salaryBreakdown: Array.isArray(slip.salaryBreakdown) ? slip.salaryBreakdown as { label: string; amount: number; contractual?: number | null; earned?: number; kind: "earning" | "deduction"; includeInGross: boolean; visibleOnPayslip: boolean }[] : null, adjustmentEarnings: 0 } }),
    };
    } catch {
      // Do not create a partial ZIP when one payslip cannot be generated.
      return { error: true, employeeNumber: slip.employee.employeeNumber };
    }
  });
  const failed = pdfs.filter((pdf): pdf is Extract<PdfResult, { error: true }> => "error" in pdf);
  if (failed.length) return NextResponse.json({ error: "Unable to generate all requested payslips.", failedPayslips: failed.map(({ employeeNumber }) => ({ employeeNumber })) }, { status: 500 });
  const generated = pdfs as Extract<PdfResult, { data: Buffer }>[];
  if (generated.length === 1) return new NextResponse(new Uint8Array(generated[0].data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${generated[0].name}"` } });
  const zip = new JSZip(); generated.forEach((pdf) => zip.file(pdf.name, pdf.data));
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new NextResponse(new Uint8Array(content), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="payslips-${month}.zip"` } });
}
