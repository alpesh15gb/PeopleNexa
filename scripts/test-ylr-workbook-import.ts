import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { previewYlrWorkbook } from "../lib/ylr-workbook-import";

async function run() {
  const workbook = new ExcelJS.Workbook();
  const active = workbook.addWorksheet("Combined_Data");
  active.getRow(1).values = ["Source Sheet", "S. No.", "Emp. Code", "Name", "Designation", "D.O.J.", "Gross Salary", "Days in Month", "Present Days", "Total Payable Days", "Mess"];
  active.getRow(2).values = ["Mechanical Heads", 1, "YLR/001", "Asha Kumar", "Engineer", "01.08.2024", 40000, 31, 30, 31, 1500];
  const duplicate = workbook.addWorksheet("Mechanical Heads (2)");
  duplicate.getRow(1).values = active.getRow(1).values;
  duplicate.getRow(2).values = active.getRow(2).values;
  const leave = workbook.addWorksheet("ON LEAVES, LEFT, OFF SEASON ETC");
  leave.getRow(7).values = ["", 1, "YLR/999"];

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await previewYlrWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  assert.equal(preview.sheets.length, 1);
  assert.equal(preview.rows.length, 1);
  assert.deepEqual(preview.rows[0], { sheet: "Mechanical Heads", rowNumber: 2, employeeCode: "YLR/001", name: "Asha Kumar", designation: "Engineer", joiningDate: "2024-08-01", grossSalary: 40000, department: "Mechanical Heads", messPlan: 1500 });
  console.log("YLR workbook import parser tests passed");
}

void run();
