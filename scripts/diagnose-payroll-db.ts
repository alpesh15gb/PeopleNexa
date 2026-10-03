import "dotenv/config";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

// Read-only production diagnostic. Never print employee rows, SQL parameters,
// connection strings or salary values.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Load the server's DATABASE_URL before running this check.");
  const expectedModels = [
    { name: "Payslip", fields: Object.values(Prisma.PayslipScalarFieldEnum) },
    { name: "PayrollRun", fields: Object.values(Prisma.PayrollRunScalarFieldEnum) },
    { name: "PayrollRunMember", fields: Object.values(Prisma.PayrollRunMemberScalarFieldEnum) },
  ];
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
    AND table_name IN ('Payslip', 'PayrollRun', 'PayrollRunMember')
  `;
  const missing = expectedModels.flatMap((model) => model.fields
    .filter((field) => !columns.some((column) => column.table_name === model.name && column.column_name === field))
    .map((field) => `${model.name}.${field}`));
  console.log("Missing payroll database fields:", missing.length ? missing.join(", ") : "none");
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
    AND tablename = 'Payslip'
  `;
  console.log("Run-scoped payslip index:", indexes.some((index) => index.indexname === "Payslip_payrollRunId_employeeId_key") ? "present" : "MISSING");
  console.log("Obsolete employee/month payslip index:", indexes.some((index) => index.indexname === "Payslip_employeeId_month_key") ? "PRESENT — check payroll-run migration" : "absent");
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished: boolean; rolled_back: boolean }>>`
    SELECT migration_name, finished_at IS NOT NULL AS finished,
    rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations"
    ORDER BY started_at DESC LIMIT 12
  `;
  console.log("Recent migration status:", JSON.stringify(migrations));
  if (missing.length) {
    process.exitCode = 1;
    return;
  }
  // An impossible sentinel ID checks the complete projection without reading a salary.
  const probeId = "__payroll_readonly_schema_probe__";
  await prisma.payslip.findUnique({ where: { id: probeId } });
  console.log("Standalone payslip lookup: passed");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.payslip.findUnique({ where: { id: probeId } });
  }, { isolationLevel: "Serializable", timeout: 20000 });
  console.log("Read-only Serializable payslip lookup: passed");
  console.log("If all checks pass, obtain the FIRST PostgreSQL error from the failed generation request; 25P02 is a subsequent error.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Payroll database diagnostic failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
