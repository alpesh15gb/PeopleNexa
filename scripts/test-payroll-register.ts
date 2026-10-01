import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { payrollRegisterWorkbook } from "../lib/payroll-register";

async function main() {
  const buffer = await payrollRegisterWorkbook({ id: "run-1", month: "2026-08", status: "approved", payslips: [{ grossEarnings: 1000, deductions: 100, netSalary: 900, inputSnapshot: { employee: { employeeNumber: "E-1", firstName: "Asha", lastName: "Patel", position: "Engineer", departmentName: "Engineering", joiningDate: "2024-01-01" }, attendance: { workingDays: 31, presentDays: 28, lateDays: 1, halfDays: 1, absentDays: 1, onLeaveDays: 1 } }, document: { version: 2, generatedAt: "2026-08-31T00:00:00.000Z", policy: { id: "policy", version: 1, source: "configuration_record" }, branding: { legalName: "PeopleNexa", displayName: "PeopleNexa", address: null, contact: null, logoUrl: null }, employee: { name: "Asha Patel", employeeNumber: "E-1", designation: "Engineer", department: "Engineering", joiningDate: "2024-01-01", bankName: null, accountMasked: null, panMasked: null, uan: null, esiIpNumber: null }, period: "2026-08", days: { payable: 31, paid: 29.5, lop: 1.5 }, components: [{ code: "BASIC", label: "Basic", category: "earning", contractual: 1000, earned: 1000, includeInGross: true, visibleOnPayslip: true, nonCash: false }, { code: "PF", label: "PF", category: "deduction", contractual: null, earned: 100, includeInGross: false, visibleOnPayslip: true, nonCash: false }], totals: { gross: 1000, earnedGross: 1000, deductions: 100, net: 900 } } }] });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Abstract", "Engineering"]);
  assert.equal(workbook.getWorksheet("Abstract")?.getCell("F6").value, 900, "abstract net pay comes from the saved document snapshot");
  const department = workbook.getWorksheet("Engineering")!;
  const headers = Array.from(department.getRow(4).values as unknown as unknown[]);
  assert.ok(headers.includes("Earning: Basic (BASIC)"));
  assert.ok(headers.includes("Deduction: PF (PF)"));
  assert.equal(department.getCell("B5").value, "E-1");
  assert.equal(department.getCell("G5").value, 28, "attendance is read from the saved input snapshot");
  console.log("payroll register workbook checks passed");
}
main();
