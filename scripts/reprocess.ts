import "dotenv/config";
import { prisma } from "../lib/prisma";
import { reprocessFailedLogs } from "../lib/iclock";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "crk" } });
  const t0 = Date.now();
  const n = await reprocessFailedLogs(tenant.id, 5000);
  console.log(`reprocessed: ${n} in ${Date.now() - t0}ms`);
  const flagged = await prisma.deviceLog.count({ where: { tenantId: tenant.id, error: { not: null } } });
  console.log("still flagged:", flagged);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
