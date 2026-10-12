import assert from "node:assert/strict";
import { inactiveEmployeeReportWhere } from "../lib/inactive-employee-report";

// Exercise the generated query against records from different tenants, branches,
// statuses and account types, including a full-name search split across fields.
type RecordRow = Record<string, unknown>;
function matches(row: RecordRow, filter: RecordRow): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "AND") return (value as RecordRow[]).every((child) => matches(row, child));
    if (key === "OR") return (value as RecordRow[]).some((child) => matches(row, child));
    if (value && typeof value === "object") {
      const rule = value as RecordRow;
      if ("contains" in rule) return String(row[key] ?? "").toLowerCase().includes(String(rule.contains).toLowerCase());
      if ("in" in rule) return (rule.in as unknown[]).includes(row[key]);
      return matches((row[key] ?? {}) as RecordRow, rule);
    }
    return row[key] === value;
  });
}
const base = { tenantId: "tenant-a", loginOnly: false, status: "inactive", firstName: "Ravi", lastName: "Kumar", employeeNumber: "MN/0001", deviceCode: "0001", branchId: "branch-a", departmentId: "mechanical", branch: { locationId: "location-a" } };
const records = [base, { ...base, tenantId: "tenant-b" }, { ...base, status: "active" }, { ...base, loginOnly: true }, { ...base, branchId: "branch-b", branch: { locationId: "location-b" } }];
const find = (options: Parameters<typeof inactiveEmployeeReportWhere>[0]) => records.filter((record) => matches(record, inactiveEmployeeReportWhere(options) as RecordRow));
const options = { tenantId: "tenant-a", role: "admin" };
assert.equal(find({ ...options, query: " rAvI   KuMaR " }).length, 2);
assert.equal(find({ ...options, query: "MN/0001", branchId: "branch-a" }).length, 1);
assert.equal(find({ ...options, query: "0001", departmentId: "mechanical" }).length, 2);
assert.equal(find({ ...options, query: "not found" }).length, 0);
assert.equal(find({ ...options, role: "branch_manager", manager: { branchId: "branch-a", locationId: null }, branchId: "branch-b" }).length, 0, "A requested branch must never override assigned branch scope");
assert.equal(find({ ...options, role: "location_manager", manager: { branchId: null, locationId: "location-a" }, branchId: "branch-b" }).length, 0);
assert.equal(find({ ...options, role: "branch_manager", manager: null }).length, 0);
assert.equal(find({ ...options, role: "location_manager", manager: null }).length, 0);
console.log("inactive employee report tests passed: full names, IDs, status, tenant, login-only accounts, department and manager scopes");
