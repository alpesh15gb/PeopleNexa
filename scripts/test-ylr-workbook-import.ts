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

  const formulaSheet = workbook.addWorksheet("Formula Plans");
  for (let row = 1; row < 5; row++) formulaSheet.getCell(`A${row}`).value = "Payroll";
  formulaSheet.getCell("A5").value = "Employee Details";
  formulaSheet.getRow(6).values = ["", "", "Emp. Code", "Name", "Designation", "D.O.J.", "Days in Month", "Present Days", "Gross Salary", "", "Total Payable Days", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Mess"];
  const formulaRows = [
    [7, "YLR/800", "Bina Shah", "Supervisor", "01.08.2024", "ROUND(800/G7*(H7+K7),0)", 800],
    [8, "YLR/1000", "Chetan Rao", "Operator", "01.08.2024", "ROUND(1000/G8*H8,0)", 1000],
    [9, "YLR/1500", "Divya Nair", "Technician", "01.08.2024", "ROUND(1500/G9*H9,0)", 1500],
  ] as const;
  for (const [row, code, name, designation, doj, formula] of formulaRows) {
    formulaSheet.getCell(`C${row}`).value = code;
    formulaSheet.getCell(`D${row}`).value = name;
    formulaSheet.getCell(`E${row}`).value = designation;
    formulaSheet.getCell(`F${row}`).value = doj;
    formulaSheet.getCell(`G${row}`).value = 31;
    formulaSheet.getCell(`H${row}`).value = 30;
    formulaSheet.getCell(`I${row}`).value = 40000;
    formulaSheet.getCell(`K${row}`).value = 1;
    formulaSheet.getCell(`Z${row}`).value = { formula, result: 0 };
  }

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await previewYlrWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  assert.equal(preview.sheets.length, 2);
  assert.equal(preview.rows.length, 4);
  assert.deepEqual(preview.rows[0], { sheet: "Mechanical Heads", rowNumber: 2, employeeCode: "YLR/001", name: "Asha Kumar", designation: "Engineer", joiningDate: "2024-08-01", grossSalary: 40000, department: "Mechanical Heads", messPlan: 1500 });
  assert.deepEqual(preview.rows.slice(1).map((row) => row.messPlan), [800, 1000, 1500]);
  console.log("YLR workbook import parser tests passed");
}

void run();
