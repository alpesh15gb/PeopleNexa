import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "crk" } });
  if (!tenant) {
    console.log("no crk tenant found");
    return;
  }

  const existing = await prisma.device.findUnique({ where: { serialNumber: "ESLDEMO0001" } });
  if (!existing) {
    await prisma.device.create({
      data: {
        tenantId: tenant.id,
        name: "Main Entrance — Fingerprint",
        serialNumber: "ESLDEMO0001",
        ipAddress: "192.168.1.50",
        type: "biometric",
        protocol: "attlog",
        config: {},
      },
    });
    console.log("demo device created for", tenant.slug);
  } else {
    console.log("device already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
