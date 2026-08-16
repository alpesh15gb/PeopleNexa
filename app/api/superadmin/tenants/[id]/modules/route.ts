import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/lib/prisma";
import { MODULES } from "@/lib/modules";
import { invalidateTenantAccess } from "@/lib/modules-server";

/** PUT with { modules: string[] } — the set of modules that should be enabled. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const body = await req.json();
    const enabled: string[] | null = Array.isArray(body.modules) ? (body.modules as unknown[]).map(String) : null;
    if (!enabled) {
      return NextResponse.json({ error: "modules must be an array of module keys." }, { status: 400 });
    }
    const unknown = enabled.filter((k) => !MODULES.some((m) => m.key === k));
    if (unknown.length) {
      return NextResponse.json({ error: `Unknown modules: ${unknown.join(", ")}` }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const enabledSet = new Set(enabled);
    await prisma.$transaction(
      MODULES.map((m) =>
        prisma.tenantModule.upsert({
          where: { tenantId_module: { tenantId: id, module: m.key } },
          update: { enabled: enabledSet.has(m.key) },
          create: { tenantId: id, module: m.key, enabled: enabledSet.has(m.key) },
        })
      )
    );

    invalidateTenantAccess(id);
    const modules = await prisma.tenantModule.findMany({
      where: { tenantId: id },
      select: { module: true, enabled: true },
      orderBy: { module: "asc" },
    });
    return NextResponse.json({ modules });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to update modules.";
    const status = message === "unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
