import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEbioserverConfig, importEmployeesFromEbioserver } from "@/lib/ebioserver";

// POST /api/settings/ebioserver/import — pull the employee master from this
// workspace's eBioserver and create employees (idempotent).
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });

  const profile = getEbioserverConfig(tenant);
  if (!profile.url || !profile.username) {
    return NextResponse.json({ error: "Configure the eBioserver connection first." }, { status: 400 });
  }

  const result = await importEmployeesFromEbioserver(session.tenantId, profile);
  return NextResponse.json(result);
}
