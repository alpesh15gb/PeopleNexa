import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const bankExport = source("../app/api/payroll/export/route.ts");
const registerExport = source("../app/api/payroll/runs/[id]/register/route.ts");
const processRoute = source("../app/(portal)/admin/payroll/process/page.tsx");
const generate = source("../app/api/payroll/generate/route.ts");
const panel = source("../app/(portal)/admin/payroll/payroll-panel.tsx");
const shell = source("../components/shell.tsx");

assert.match(bankExport, /const slipStatus = run\.status === "paid" \? "paid" : "finalized"/);
assert.match(bankExport, /payrollRunId: runId/);
assert.match(bankExport, /status: slipStatus/);
assert.doesNotMatch(bankExport, /statusParam/);
assert.match(registerExport, /payrollOperationLocationId\(session, new URL\(req\.url\)\.searchParams\.get\("locationId"\)\)/);
assert.match(panel, /register\?\$\{new URLSearchParams\(\{ locationId: locationId \?\? "" \}\)/);
assert.match(processRoute, /redirect\(`\/admin\/payroll/);
assert.match(processRoute, /params\.run/);
assert.match(generate, /No effective published payroll policy exists for this scope and period/);
assert.match(panel, /Only employees in this monthly payroll run are shown/);
assert.match(shell, /Monthly payroll/);
assert.match(shell, /canManagePayrollPolicy/);
console.log("payroll revamp safety and navigation checks passed");
