import { prisma } from "../lib/prisma";
import { saveEbioserverConfig, pullTenant } from "../lib/ebioserver";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set to run the eBioserver pull.`);
  return value;
}

async function main() {
  const tenantSlug = required("EBIO_TENANT_SLUG");
  const url = required("EBIO_URL");
  const username = required("EBIO_USERNAME");
  const password = required("EBIO_PASSWORD");

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: tenantSlug } });

  const profile = await saveEbioserverConfig(tenant.id, {
    url,
    username,
    password,
    enabled: true,
    pollIntervalMinutes: Number(process.env.EBIO_POLL_INTERVAL_MINUTES ?? "5"),
  });
  console.log("profile saved:", { url: profile.url, username: profile.username, enabled: profile.enabled, lastLogId: profile.lastLogId });

  const t0 = Date.now();
  const res = await pullTenant(tenant.id, profile);
  console.log("pull result:", { ...res, ms: Date.now() - t0 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
