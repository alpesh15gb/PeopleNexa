import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Adjustment = { label: string; amount: number };

export type PayslipDocumentData = {
  companyName: string;
  month: string;
  employee: { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; department: { name: string } | null; bankName: string | null; accountNumber: string | null; ifscCode: string | null; pan: string | null; uan: string | null };
  payslip: { basicSalary: number; allowances: number; overtimePay: number; adjustmentEarnings: number; grossEarnings: number; pfEmployee: number; esicEmployee: number; professionalTax: number; lwf: number; tds: number; lateFines: number; loanDeduction: number; absentDeduction: number; deductions: number; netSalary: number; presentDays: number; lateDays: number; halfDays: number; absentDays: number; workingDays: number; adjustments: Adjustment[] | null };
};

const money = (amount: number) => Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${month}-01T00:00:00+05:30`));

export async function renderPayslipPdf(data: PayslipDocumentData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 28, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const left = 28; const right = 567; const width = right - left;
  doc.font("Helvetica-Bold").fontSize(14).text(data.companyName, left, 46, { width, align: "center" });
  doc.font("Helvetica").fontSize(8).fillColor("#1f2937").text("Salary statement", left, 64, { width, align: "center" });
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text(`Payslip for the month of ${monthLabel(data.month)}`, left, 78, { width, align: "center" });
  try { const logo = await readFile(path.join(process.cwd(), "public", "logo.png")); doc.image(logo, left + 8, 42, { fit: [48, 48] }); } catch { /* Company name remains the document header. */ }

  let y = 102;
  const box = (top: number, height: number) => doc.rect(left, top, width, height).strokeColor("#111827").lineWidth(0.7).stroke();
  const label = (x: number, top: number, key: string, value: string) => { doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#111827").text(key, x, top); doc.font("Helvetica").text(value || "-", x + 86, top, { width: 145 }); };
  box(y, 104); doc.font("Helvetica-Bold").fontSize(8).text("EMPLOYEE DETAILS", left, y + 4, { width, align: "center" }); doc.moveTo(left, y + 17).lineTo(right, y + 17).stroke();
  const e = data.employee;
  label(left + 8, y + 26, "Employee name:", `${e.firstName} ${e.lastName}`.trim()); label(left + 285, y + 26, "Employee ID:", e.deviceCode ?? e.employeeNumber);
  label(left + 8, y + 43, "Designation:", e.position ?? "-"); label(left + 285, y + 43, "Date of joining:", e.joiningDate ? new Intl.DateTimeFormat("en-IN").format(e.joiningDate) : "-");
  label(left + 8, y + 60, "Department:", e.department?.name ?? "-"); label(left + 285, y + 60, "Employee Code:", e.employeeNumber);
  label(left + 8, y + 77, "UAN:", e.uan ?? "-"); label(left + 285, y + 77, "A/C no.:", e.accountNumber ?? "-");
  label(left + 8, y + 94, "Bank name:", e.bankName ?? "-"); label(left + 285, y + 94, "PAN:", e.pan ?? "-"); y += 112;
  box(y, 28); const paidDays = data.payslip.presentDays + data.payslip.lateDays + data.payslip.halfDays * 0.5;
  doc.font("Helvetica-Bold").fontSize(8).text(`Payable days: ${data.payslip.workingDays}`, left + 28, y + 10).text(`Paid days: ${paidDays}`, left + 225, y + 10).text(`LOPs: ${data.payslip.absentDays + data.payslip.halfDays * 0.5}`, left + 400, y + 10);
  y += 42;
  const line = (name: string, amount: number): [string, number] => [name, amount];
  const rows: [string, number][] = [
    line("Basic", data.payslip.basicSalary), line("Allowances", data.payslip.allowances), line("Overtime", data.payslip.overtimePay),
    ...((data.payslip.adjustments ?? []).filter((a) => a.amount > 0).map((a) => line(a.label, a.amount))),
  ].filter((row) => row[1] > 0);
  const deductions: [string, number][] = [
    line("EPF", data.payslip.pfEmployee), line("ESIC", data.payslip.esicEmployee), line("Professional Tax", data.payslip.professionalTax),
    line("LWF", data.payslip.lwf), line("TDS", data.payslip.tds), line("Late fine", data.payslip.lateFines),
    line("Loan / advance", data.payslip.loanDeduction), line("LOP deduction", data.payslip.absentDeduction),
    ...(data.payslip.adjustments ?? []).filter((a) => a.amount < 0).map((a) => line(a.label, Math.abs(a.amount))),
  ].filter((row) => row[1] > 0);
  const tableHeight = 246; box(y, tableHeight);
  doc.rect(left, y, width / 2, 28).fillAndStroke("#d8e6f7", "#111827"); doc.rect(left + width / 2, y, width / 2, 28).fillAndStroke("#d8e6f7", "#111827");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(8).text("EARNINGS", left, y + 10, { width: width / 2, align: "center" }).text("DEDUCTIONS", left + width / 2, y + 10, { width: width / 2, align: "center" });
  doc.moveTo(left + width / 2, y).lineTo(left + width / 2, y + tableHeight).stroke();
  const drawRows = (items: [string, number][], x: number) => items.forEach(([name, amount], index) => { const top = y + 34 + index * 19; if (index % 2 === 0) doc.rect(x + 1, top - 2, width / 2 - 2, 18).fill("#f3f4f6"); doc.fillColor("#111827").font("Helvetica").fontSize(8).text(name, x + 8, top + 3, { width: 170 }).text(money(amount), x + width / 2 - 92, top + 3, { width: 82, align: "right" }); });
  drawRows(rows, left); drawRows(deductions, left + width / 2);
  const totalY = y + tableHeight - 28; doc.moveTo(left, totalY).lineTo(right, totalY).stroke();
  doc.font("Helvetica-Bold").fontSize(8).text("GROSS EARNINGS", left + 8, totalY + 10).text(money(data.payslip.grossEarnings), left + width / 2 - 100, totalY + 10, { width: 90, align: "right" }).text("TOTAL DEDUCTIONS", left + width / 2 + 8, totalY + 10).text(money(data.payslip.deductions), right - 100, totalY + 10, { width: 90, align: "right" });
  y += tableHeight + 8; doc.rect(left, y, width, 26).fillAndStroke("#f7f7f7", "#111827"); doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(`NET PAY AMOUNT: INR ${money(data.payslip.netSalary)}`, left + 10, y + 8); doc.font("Helvetica").fontSize(7).text("This is a computer-generated payslip and does not require a signature.", left, y + 39);
  doc.end(); return done;
}
