import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Adjustment = { label: string; amount: number };
type PayRow = { label: string; actual?: number; amount: number };

export type PayslipDocumentData = {
  companyName: string;
  companyAddress?: string | null;
  companyContact?: string | null;
  month: string;
  employee: { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; department: { name: string } | null; bankName: string | null; accountNumber: string | null; ifscCode: string | null; pan: string | null; uan: string | null };
  payslip: { basicSalary: number; allowances: number; overtimePay: number; adjustmentEarnings: number; grossEarnings: number; pfEmployee: number; esicEmployee: number; professionalTax: number; lwf: number; tds: number; lateFines: number; loanDeduction: number; absentDeduction: number; deductions: number; netSalary: number; presentDays: number; lateDays: number; halfDays: number; absentDays: number; workingDays: number; adjustments: Adjustment[] | null };
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 30;
const RIGHT = PAGE_WIDTH - LEFT;
const WIDTH = RIGHT - LEFT;
const BORDER = "#606a75";
const INK = "#17212b";
const HEADER = "#e8f0f7";
const SHADE = "#f7f9fb";

const money = (amount: number) => Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value: number) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${month}-01T00:00:00+05:30`));
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(value) : "-";
const value = (input: string | null | undefined) => input?.trim() || "-";

export async function renderPayslipPdf(data: PayslipDocumentData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: LEFT, bufferPages: true, info: { Title: `Payslip - ${data.month}`, Author: data.companyName } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const rule = (x: number, y: number, length: number, height = 0) => doc.rect(x, y, length, height).strokeColor(BORDER).lineWidth(0.55).stroke();
  const text = (content: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}) => doc.fillColor(INK).font("Helvetica").fontSize(8).text(content, x, y, options);
  const bold = (content: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}) => doc.fillColor(INK).font("Helvetica-Bold").fontSize(8).text(content, x, y, options);

  const logo = await readFile(path.join(process.cwd(), "public", "logo.png")).catch(() => null);
  const header = (continued = false) => {
    if (logo) doc.image(logo, LEFT + 6, 31, { fit: [54, 54] });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(data.companyName || "Company", LEFT + 70, 34, { width: WIDTH - 140, align: "center", ellipsis: true });
    const address = [data.companyAddress, data.companyContact].filter(Boolean).join("  |  ") || "";
    if (address) text(address, LEFT + 70, 53, { width: WIDTH - 140, align: "center", ellipsis: true });
    bold(continued ? `PAYSLIP FOR THE MONTH OF ${monthLabel(data.month).toUpperCase()} (CONTINUED)` : `PAYSLIP FOR THE MONTH OF ${monthLabel(data.month).toUpperCase()}`, LEFT, 92, { width: WIDTH, align: "center" });
    doc.moveTo(LEFT, 108).lineTo(RIGHT, 108).strokeColor(BORDER).lineWidth(0.8).stroke();
  };

  const detail = (x: number, y: number, key: string, content: string) => {
    bold(key, x, y, { width: 88 });
    text(content, x + 90, y, { width: 165, ellipsis: true });
  };

  header();
  let y = 121;
  const detailsHeight = 122;
  rule(LEFT, y, WIDTH, detailsHeight);
  doc.rect(LEFT, y, WIDTH, 19).fillAndStroke(HEADER, BORDER);
  bold("EMPLOYEE DETAILS", LEFT, y + 6, { width: WIDTH, align: "center" });
  const e = data.employee;
  const leftDetails: [string, string][] = [
    ["Employee Name", `${e.firstName} ${e.lastName}`.trim() || "-"],
    ["Designation", value(e.position)],
    ["Department", value(e.department?.name)],
    ["ESIC / UAN", value(e.uan)],
  ];
  const rightDetails: [string, string][] = [
    ["Employee ID", value(e.deviceCode ?? e.employeeNumber)],
    ["Date of Joining", date(e.joiningDate)],
    ["Bank", value(e.bankName)],
    ["Account Number", value(e.accountNumber)],
    ["PAN", value(e.pan)],
  ];
  leftDetails.forEach(([key, content], index) => detail(LEFT + 9, y + 28 + index * 20, key, content));
  rightDetails.forEach(([key, content], index) => detail(LEFT + 282, y + 28 + index * 18, key, content));
  y += detailsHeight + 12;

  rule(LEFT, y, WIDTH, 30);
  const paidDays = data.payslip.presentDays + data.payslip.lateDays + data.payslip.halfDays * 0.5;
  const lops = data.payslip.absentDays + data.payslip.halfDays * 0.5;
  const dayMetric = (x: number, label: string, amount: number) => { bold(label, x, y + 7); text(number(amount), x, y + 17); };
  dayMetric(LEFT + 38, "PAYABLE DAYS", data.payslip.workingDays);
  dayMetric(LEFT + 225, "PAID DAYS", paidDays);
  dayMetric(LEFT + 402, "LOPS", lops);
  y += 43;

  const earnings: PayRow[] = [
    { label: "Basic Salary", actual: data.payslip.basicSalary, amount: data.payslip.basicSalary },
    { label: "Allowances", actual: data.payslip.allowances, amount: data.payslip.allowances },
    { label: "Overtime Pay", amount: data.payslip.overtimePay },
    ...(data.payslip.adjustments ?? []).filter((adjustment) => adjustment.amount > 0).map((adjustment) => ({ label: adjustment.label, amount: adjustment.amount })),
  ].filter((row) => row.amount > 0);
  const deductions: PayRow[] = [
    { label: "EPF", amount: data.payslip.pfEmployee },
    { label: "ESIC", amount: data.payslip.esicEmployee },
    { label: "Professional Tax", amount: data.payslip.professionalTax },
    { label: "Labour Welfare Fund", amount: data.payslip.lwf },
    { label: "TDS", amount: data.payslip.tds },
    { label: "Late Fine", amount: data.payslip.lateFines },
    { label: "Loan / Advance", amount: data.payslip.loanDeduction },
    { label: "LOP Deduction", amount: data.payslip.absentDeduction },
    ...(data.payslip.adjustments ?? []).filter((adjustment) => adjustment.amount < 0).map((adjustment) => ({ label: adjustment.label, amount: Math.abs(adjustment.amount) })),
  ].filter((row) => row.amount > 0);

  const drawTable = (top: number, earningRows: PayRow[], deductionRows: PayRow[]) => {
    const rowHeight = 18;
    const titleHeight = 21;
    const subheadHeight = 18;
    const rowCount = Math.max(earningRows.length, deductionRows.length, 1);
    const height = titleHeight + subheadHeight + rowCount * rowHeight;
    const middle = LEFT + WIDTH / 2;
    rule(LEFT, top, WIDTH, height);
    doc.rect(LEFT, top, WIDTH / 2, titleHeight).fillAndStroke(HEADER, BORDER);
    doc.rect(middle, top, WIDTH / 2, titleHeight).fillAndStroke(HEADER, BORDER);
    bold("EARNINGS", LEFT, top + 7, { width: WIDTH / 2, align: "center" });
    bold("DEDUCTIONS", middle, top + 7, { width: WIDTH / 2, align: "center" });
    doc.rect(LEFT, top + titleHeight, WIDTH, subheadHeight).fillAndStroke(SHADE, BORDER);
    doc.moveTo(middle, top).lineTo(middle, top + height).strokeColor(BORDER).stroke();
    doc.moveTo(LEFT + 178, top + titleHeight).lineTo(LEFT + 178, top + height).strokeColor(BORDER).stroke();
    doc.moveTo(LEFT + 238, top + titleHeight).lineTo(LEFT + 238, top + height).strokeColor(BORDER).stroke();
    doc.moveTo(RIGHT - 78, top + titleHeight).lineTo(RIGHT - 78, top + height).strokeColor(BORDER).stroke();
    bold("PARTICULARS", LEFT + 7, top + 27); bold("ACTUALS", LEFT + 180, top + 27, { width: 54, align: "right" }); bold("EARNINGS", LEFT + 240, top + 27, { width: 72, align: "right" });
    bold("PARTICULARS", middle + 7, top + 27); bold("DEDUCTIONS", RIGHT - 76, top + 27, { width: 68, align: "right" });
    for (let index = 0; index < rowCount; index++) {
      const rowY = top + titleHeight + subheadHeight + index * rowHeight;
      if (index % 2 === 0) doc.rect(LEFT + 0.5, rowY, WIDTH - 1, rowHeight).fill(SHADE);
      doc.moveTo(LEFT, rowY + rowHeight).lineTo(RIGHT, rowY + rowHeight).strokeColor("#d6dce2").lineWidth(0.35).stroke();
      const earning = earningRows[index];
      const deduction = deductionRows[index];
      if (earning) {
        text(earning.label, LEFT + 7, rowY + 5, { width: 166, ellipsis: true });
        text(earning.actual === undefined ? "-" : money(earning.actual), LEFT + 180, rowY + 5, { width: 54, align: "right" });
        text(money(earning.amount), LEFT + 240, rowY + 5, { width: 72, align: "right" });
      }
      if (deduction) {
        text(deduction.label, middle + 7, rowY + 5, { width: 185, ellipsis: true });
        text(money(deduction.amount), RIGHT - 76, rowY + 5, { width: 68, align: "right" });
      }
    }
    return height;
  };

  // The first page starts below employee details; this limit leaves footer clearance there and on continuation pages.
  const rowsPerPage = 23;
  const totalRows = Math.max(earnings.length, deductions.length);
  for (let offset = 0; offset < Math.max(totalRows, 1); offset += rowsPerPage) {
    if (offset > 0) { doc.addPage(); header(true); y = 121; }
    const sliceEnd = offset + rowsPerPage;
    y += drawTable(y, earnings.slice(offset, sliceEnd), deductions.slice(offset, sliceEnd)) + 10;
  }

  if (y > PAGE_HEIGHT - 115) { doc.addPage(); header(true); y = 121; }
  rule(LEFT, y, WIDTH, 27);
  bold("GROSS EARNINGS", LEFT + 8, y + 9); bold(money(data.payslip.grossEarnings), LEFT + WIDTH / 2 - 104, y + 9, { width: 94, align: "right" });
  bold("TOTAL DEDUCTIONS", LEFT + WIDTH / 2 + 8, y + 9); bold(money(data.payslip.deductions), RIGHT - 104, y + 9, { width: 94, align: "right" });
  y += 39;
  doc.rect(LEFT, y, WIDTH, 31).fillAndStroke(HEADER, BORDER);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("NET PAY AMOUNT", LEFT + 10, y + 10);
  doc.font("Helvetica-Bold").fontSize(10).text(`INR ${money(data.payslip.netSalary)}`, LEFT, y + 10, { width: WIDTH - 10, align: "right" });

  const pages = doc.bufferedPageRange();
  for (let page = 0; page < pages.count; page++) {
    doc.switchToPage(page);
    doc.moveTo(LEFT, PAGE_HEIGHT - 46).lineTo(RIGHT, PAGE_HEIGHT - 46).strokeColor(BORDER).lineWidth(0.45).stroke();
    doc.font("Helvetica-Oblique").fontSize(7).fillColor("#4b5563").text("This is a computer-generated payslip and does not require a signature.", LEFT, PAGE_HEIGHT - 37, { width: WIDTH - 55 });
    doc.font("Helvetica").fontSize(7).text(`Page ${page + 1} of ${pages.count}`, RIGHT - 55, PAGE_HEIGHT - 37, { width: 55, align: "right" });
  }
  doc.end();
  return done;
}
