import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client.ts";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface PunchJson {
  id: string;
  time: string;
  source: string;
  type: "in" | "out";
  [k: string]: unknown;
}

async function main() {
  const all = await prisma.attendance.findMany({
    select: { id: true, tenantId: true, employeeId: true, date: true, punchInTime: true, punchOutTime: true, punches: true },
  });
  const rows = all.filter((r) => r.punches === null);
  console.log(`found ${rows.length} attendance rows without a punch snapshot`);

  let migrated = 0;
  for (const row of rows) {
    if (!row.punchInTime) continue; // no punches to synthesize

    const json: PunchJson[] = [];
    const inPunch = await prisma.punch.create({
      data: {
        tenantId: row.tenantId,
        employeeId: row.employeeId,
        source: "mobile",
        punchTime: row.punchInTime,
        inOutHint: "unknown",
      },
    });
    json.push({ id: inPunch.id, time: inPunch.punchTime.toISOString(), source: "mobile", type: "in" });

    if (row.punchOutTime) {
      const outPunch = await prisma.punch.create({
        data: {
          tenantId: row.tenantId,
          employeeId: row.employeeId,
          source: "mobile",
          punchTime: row.punchOutTime,
          inOutHint: "unknown",
        },
      });
      json.push({ id: outPunch.id, time: outPunch.punchTime.toISOString(), source: "mobile", type: "out" });
    }

    await prisma.attendance.update({
      where: { id: row.id },
      data: {
        punches: json as unknown as Prisma.InputJsonValue,
        finalized: true,
        reviewStatus: null,
        note: null,
      },
    });
    migrated++;
  }

  console.log(`backfilled ${migrated} rows; punches now live for reconciliation`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
