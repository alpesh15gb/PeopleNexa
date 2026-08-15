import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getEbioserverConfig, backfillDays } from "../lib/ebioserver";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "crk" } });
  const profile = getEbioserverConfig(tenant);
  console.log(`backfilling 90 days for ${tenant.slug} from ${profile.url}`);

  const t0 = Date.now();
  const res = await backfillDays(tenant.id, profile, 90, (day, date, records, ingested) => {
    if (day % 10 === 0 || day < 3) {
      console.log(`  day -${day} (${date}): ${records} records, ${ingested} new punches`);
    }
  });
  console.log("done:", { ...res, ms: Date.now() - t0 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
