import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "crk" } });

  // Remove everything the previous live pull created.
  const devices = await prisma.device.findMany({ where: { tenantId: tenant.id, config: { path: ["ebioserver"], equals: true } } });
  await prisma.deviceLog.deleteMany({ where: { deviceId: { in: devices.map((d) => d.id) } } });
  await prisma.device.deleteMany({ where: { id: { in: devices.map((d) => d.id) } } });
  console.log(`cleaned ${devices.length} eBioserver devices and their logs`);

  // Fresh profile (cursor 0 → bootstrap path next pull).
  const config = { ...((tenant.config ?? {}) as Record<string, unknown>) } as Record<string, unknown>;
  delete config.ebioserver;
  await prisma.tenant.update({ where: { id: tenant.id }, data: { config: config as never } });

  // Demo employee carrying a real device code that punches today (HO076).
  const existing = await prisma.employee.findFirst({ where: { tenantId: tenant.id, employeeNumber: "HO076" } });
  if (!existing) {
    const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id } });
    const shift = await prisma.shift.findFirst({ where: { tenantId: tenant.id } });
    await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeNumber: "HO076",
        firstName: "Device",
        lastName: "Punch Demo",
        email: "device.demo@apex.com",
        password: await hashPassword("demo123"),
        role: "employee",
        position: "Biometric Demo",
        branchId: branch?.id,
        shiftId: shift?.id,
      },
    });
    console.log("created demo employee HO076 (Device Punch Demo)");
  } else {
    console.log("demo employee HO076 already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
