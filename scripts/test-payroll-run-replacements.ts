import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20261001000001_payroll_run_replacements/migration.sql", "utf8");
const generator = readFileSync("app/api/payroll/generate/route.ts", "utf8");
const payrollPage = readFileSync("app/(portal)/admin/payroll/page.tsx", "utf8");

assert.doesNotMatch(schema, /@@unique\(\[tenantId, scopeKey, month\]\)/, "historical runs must not consume the active-run key");
assert.match(schema, /replacedRunId\s+String\?/, "replacement runs retain a predecessor link");
assert.match(migration, /DROP INDEX IF EXISTS "PayrollRun_tenantId_scopeKey_month_key"/, "migration removes the destructive historical uniqueness constraint");
assert.match(migration, /WHERE "status" IN \('draft', 'reviewed', 'approved', 'finalized', 'paid'\)/, "only active lifecycle states are unique per scope and month");
assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+"PayrollRun"/i, "migration preserves historical payroll rows");
assert.match(generator, /status: \{ in: \["cancelled", "reversed"\] \}/, "generation can replace retained terminal runs");
assert.match(generator, /replacedRunId/, "replacement generation links rather than deletes historical rows");
assert.doesNotMatch(generator, /payrollRun\.(?:delete|deleteMany)\(/, "replacement generation never deletes historical runs");
assert.doesNotMatch(generator, /A cancelled payroll exists/, "cancelled history must not block preview creation");
assert.match(payrollPage, /candidate\.status !== 'cancelled' && candidate\.status !== 'reversed'/, "the payroll selection defaults to the active run, not history");
console.log("payroll run replacement checks passed");
