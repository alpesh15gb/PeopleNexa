import assert from "node:assert/strict";
import { employeeExportSourceFields } from "../lib/employee-export-source";
assert.deepEqual(employeeExportSourceFields(null), []);
assert.deepEqual(employeeExportSourceFields({
  BANK_Account: "00001234", OFF_Salary: 0, PER_Eligible: false,
  EDU_Details: { degree: "Diploma" }, ID_Number: "ID001", WRK_Employer: "Company",
  PER_Empty: "", password: "hidden", OFF_Password: "hidden", PER_Token: "hidden",
  RPT_base64Image: "binary", unknown: "not an HR source field",
}), [
  ["BANK_Account", "00001234"], ["OFF_Salary", "0"], ["PER_Eligible", "false"],
  ["EDU_Details", '{"degree":"Diploma"}'], ["ID_Number", "ID001"], ["WRK_Employer", "Company"],
]);
console.log("employee export source tests passed: retained details, leading zeros, zero/false, credential and binary exclusions");
