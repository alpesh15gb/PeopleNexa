// Backfill TenantModule rows for tenants that predate the module-gating system
// (e.g. a database seeded by the original single-tenant code, which has no
// TenantModule rows — without them every module is treated as disabled).
//
// Idempotent and non-destructive: existing rows are left untouched (admins may
// have fine-tuned them); only MISSING module rows are created, enabled per the
// tenant's plan defaults. Safe to run on every boot.
//
// Run with: npx tsx scripts/backfill-modules.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { MODULES, planFor } from "../lib/modules";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const tenants = await prisma.tenant.findMany({ select: { id: true, plan: true } });
  let created = 0;
  let fixed = 0;

  for (const t of tenants) {
    const existing = await prisma.tenantModule.findMany({ where: { tenantId: t.id }, select: { module: true } });
    const have = new Set(existing.map((r) => r.module));
    const defaults = planFor(t.plan).modules;

    const missing = MODULES.filter((m) => !have.has(m.key));
    for (const m of missing) {
      await prisma.tenantModule.create({
        data: { tenantId: t.id, module: m.key, enabled: defaults.includes(m.key) },
      });
      created++;
    }
    if (missing.length > 0) {
      fixed++;
      console.log(`  ${t.plan.padEnd(12)} ${t.id} — ${missing.length} module rows created (plan defaults applied)`);
    } else {
      console.log(`  ${t.plan.padEnd(12)} ${t.id} — ok, all ${have.size} modules present`);
    }
  }

  console.log(`\nBackfilled ${created} module rows across ${tenants.length} tenant(s) (${fixed} fixed).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
