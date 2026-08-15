import "dotenv/config";
import { prisma } from "../lib/prisma";
import { saveEbioserverConfig, pullTenant } from "../lib/ebioserver";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "crk" } });

  const profile = await saveEbioserverConfig(tenant.id, {
    url: "http://183.82.103.125:8080/Webservice.asmx",
    username: "keystone",
    password: "Keystone@999",
    enabled: true,
    pollIntervalMinutes: 5,
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
