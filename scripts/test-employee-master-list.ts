import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { loadEmployeeMasterList, masterStatusWhere, type MasterStatus } from "../lib/employee-master-list";
import { assignmentPendingWhere } from "../lib/employee-assignment";

async function main() {
  const original = { groupBy: prisma.employee.groupBy, count: prisma.employee.count, findMany: prisma.employee.findMany };
  const records = [
    { id: "active", tenantId: "tenant1", loginOnly: false, employeeNumber: "001", deviceCode: "101", firstName: "Active", lastName: "Person", position: "Driver", status: "active", role: "employee", branchId: "branch1", branch: { name: "Branch 1" }, pending: false },
    { id: "inactive", tenantId: "tenant1", loginOnly: false, employeeNumber: "002", deviceCode: "102", firstName: "Inactive", lastName: "Person", position: "Driver", status: "inactive", role: "employee", branchId: "branch1", branch: { name: "Branch 1" }, pending: false },
    { id: "pending", tenantId: "tenant1", loginOnly: false, employeeNumber: "003", deviceCode: "103", firstName: "Pending", lastName: "Person", position: null, status: "inactive", role: "employee", branchId: null, branch: null, pending: true },
    { id: "unassigned", tenantId: "tenant1", loginOnly: false, employeeNumber: "004", deviceCode: null, firstName: "Manual", lastName: "Person", position: null, status: "inactive", role: "employee", branchId: null, branch: null, pending: false },
    { id: "foreign", tenantId: "tenant2", loginOnly: false, employeeNumber: "005", deviceCode: null, firstName: "Foreign", lastName: "Person", position: null, status: "active", role: "employee", branchId: "branch2", branch: { name: "Branch 2" }, pending: false },
    { id: "manager-login", tenantId: "tenant1", loginOnly: true, employeeNumber: "006", deviceCode: null, firstName: "Manager", lastName: "Login", position: null, status: "active", role: "branch_manager", branchId: "branch1", branch: { name: "Branch 1" }, pending: false },
  ];
  type Where = { tenantId: string; loginOnly: boolean; status?: string; branchId?: string; OR?: unknown; AND?: unknown; id?: { in: string[] } };
  const matches = (where: Where) => records.filter(row => row.tenantId === where.tenantId && row.loginOnly === where.loginOnly && (!where.status || row.status === where.status) && (!where.branchId || row.branchId === where.branchId) && (!where.OR || row.firstName === "Active") && (!where.AND || row.pending) && (!where.id || where.id.in.includes(row.id)));
  const queries: any[] = [];
  prisma.employee.groupBy = (async (args: any) => { queries.push(args); const rows = matches(args.where); return ["active", "inactive"].map(status => ({ status, _count: { _all: rows.filter(row => row.status === status).length } })); }) as any;
  prisma.employee.count = (async (args: any) => { queries.push(args); return matches(args.where).length; }) as any;
  prisma.employee.findMany = (async (args: any) => {
    queries.push(args);
    assert.ok(args.select, "list queries require explicit field selection");
    assert.equal(args.select.legacyImportData, undefined, "imported HR blobs stay out of the list");
    assert.equal(args.select.profilePicture, undefined, "base64 employee photos stay out of the list");
    assert.equal(args.select.password, undefined);
    return matches(args.where).slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 50)).map(row => Object.fromEntries(Object.keys(args.select).map(key => [key, row[key as keyof typeof row]])));
  }) as any;
  try {
    const baseWhere = { tenantId: "tenant1", loginOnly: false };
    for (const status of ["all", "active", "inactive", "assignment_pending"] as MasterStatus[]) {
      queries.length = 0;
      const result = await loadEmployeeMasterList(baseWhere, status, 1);
      assert.deepEqual(result.counts, { all: 4, active: 1, inactive: 3, assignment_pending: 1 });
      assert.equal(result.total, result.counts[status]);
      assert.ok(result.employees.every(row => !["foreign", "manager-login"].includes(row.id)));
      assert.ok(result.employees.every(row => row.assignmentPending === (row.id === "pending")));
      assert.ok(queries.length <= 4, "list uses at most four bounded queries, never editor lookups");
      for (const query of queries) { assert.equal(query.where.tenantId, "tenant1"); assert.equal(query.where.loginOnly, false); }
      const listQuery = queries.find(query => query.take === 50);
      assert.equal(listQuery.skip, 0);
      assert.equal(listQuery.where.status, status === "active" || status === "inactive" ? status : undefined);
      if (status === "assignment_pending") assert.deepEqual(listQuery.where.AND, [assignmentPendingWhere]);
    }
    const scoped = await loadEmployeeMasterList({ ...baseWhere, branchId: "branch1" }, "all", 1);
    assert.deepEqual(scoped.employees.map(row => row.id), ["active", "inactive"]);
    assert.equal(scoped.counts.assignment_pending, 0);
    const searched = await loadEmployeeMasterList({ ...baseWhere, OR: [{ firstName: { contains: "Active" } }] }, "all", 1);
    assert.deepEqual(searched.employees.map(row => row.id), ["active"]);
    const secondPage = await loadEmployeeMasterList(baseWhere, "all", 2);
    assert.equal(secondPage.employees.length, 0);
    assert.deepEqual(masterStatusWhere(baseWhere, "active"), { ...baseWhere, status: "active" });
    console.log("Employee list: lightweight bounded queries, all four filters/counts, scoped search, pending flags and pagination passed.");
  } finally {
    prisma.employee.groupBy = original.groupBy; prisma.employee.count = original.count; prisma.employee.findMany = original.findMany;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
