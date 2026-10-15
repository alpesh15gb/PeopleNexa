import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { enrichAuditEntries, auditTime } from "../lib/audit-display";
import type { AuditLog } from "../generated/prisma/client";

async function main() {
  const employeeId = "cmul6dqay041001o682zmbkcn";
  const employeeFind = prisma.employee.findMany, punchFind = prisma.punch.findMany;
  const queries: unknown[] = [];
  prisma.employee.findMany = (async (query: unknown) => {
    queries.push(query);
    return [{ id: employeeId, firstName: "Test", lastName: "Employee", employeeNumber: "TEST01" }];
  }) as typeof employeeFind;
  prisma.punch.findMany = (async (query: unknown) => {
    queries.push(query);
    return [{ id: "retained-punch", employeeId }];
  }) as typeof punchFind;
  const base: AuditLog = { id: "audit1", tenantId: "tenant1", actorId: employeeId, actorRole: "branch_manager", action: "face.review", entity: "Punch", entityId: "deleted-punch", summary: `declined held punch for ${employeeId} — punch deleted`, before: null, after: null, createdAt: new Date("2026-10-14T22:51:00Z") };
  try {
    const rows = await enrichAuditEntries([
      base,
      { ...base, id: "audit2", entityId: "retained-punch", action: "punch.held", summary: "held for admin approval (no_enrollment)" },
      { ...base, id: "audit3", after: { employee: { id: employeeId, firstName: "Original", lastName: "Name", employeeNumber: "OLD01" } } },
      { ...base, id: "foreign", tenantId: "tenant2" },
    ], "tenant1");
    assert.equal(rows.length, 3);
    assert.equal(rows[0].employeeLabel, "Test Employee (TEST01)");
    assert.equal(rows[0].readableSummary, "declined held punch for Test Employee (TEST01) — punch deleted");
    assert.equal(rows[0].summary, base.summary, "historical evidence is unchanged");
    assert.equal(rows[1].employeeLabel, "Test Employee (TEST01)");
    assert.match(rows[1].readableSummary, /Face ID not enrolled/);
    assert.equal(rows[2].employeeLabel, "Original Name (OLD01)", "historical identity survives name/code changes");
    assert.equal(rows[0].actorLabel, "Test Employee (TEST01)");
    assert.equal(rows[0].actorRoleLabel, "Branch Manager");
    for (const query of queries) assert.equal((query as { where: { tenantId: string } }).where.tenantId, "tenant1");
    assert.match(auditTime(base.createdAt), /15\/10\/2026.*04:21/);
    console.log("Audit readability: historical deleted punches, identity snapshots, actor codes, tenant boundaries and IST passed.");
  } finally {
    prisma.employee.findMany = employeeFind;
    prisma.punch.findMany = punchFind;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
