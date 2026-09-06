import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getEbioserverConfig, backfillDays } from "../lib/ebioserver";

async function main() {
  const slug = process.env.EBIO_TENANT_SLUG?.trim() || "crk";
  const days = Math.min(365, Math.max(1, Number(process.env.BACKFILL_DAYS ?? "90") || 90));
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
  const profile = getEbioserverConfig(tenant);
  console.log(`backfilling ${days} days for ${tenant.slug} from ${profile.url}`);

  const t0 = Date.now();
  const res = await backfillDays(tenant.id, profile, days, (day, date, records, ingested) => {
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
