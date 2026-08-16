import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/lib/prisma";
import { PLANS, MODULES } from "@/lib/modules";
import { getEffectivePlan } from "@/lib/plans-server";
import { invalidateTenantAccess } from "@/lib/modules-server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: true } },
        modules: { orderBy: { module: "asc" } },
        licenses: { orderBy: { createdAt: "desc" } },
        branches: { select: { id: true, name: true } },
      },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    const { _count, ...rest } = tenant;
    return NextResponse.json({ tenant: { ...rest, employeeCount: _count.employees } });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to load tenant.";
    const status = message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sa = await requireSuperAdmin();
    const { id } = await ctx.params;
    const body = await req.json();

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.email !== undefined) data.email = body.email ? String(body.email) : null;
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone) : null;
    if (body.status !== undefined && ["active", "suspended"].includes(body.status)) data.status = body.status;
    if (body.plan !== undefined) {
      if (!PLANS.some((p) => p.key === body.plan)) {
        return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
      }
      data.plan = body.plan;
      // Changing plan applies its default seat count unless one is given.
      if (body.seats === undefined) data.seats = (await getEffectivePlan(body.plan)).seats;
    }
    if (body.seats !== undefined) {
      const seats = Number(body.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 100000) {
        return NextResponse.json({ error: "Seats must be a positive integer." }, { status: 400 });
      }
      data.seats = seats;
    }
    if (body.subscriptionExpiry !== undefined) {
      data.subscriptionExpiry = body.subscriptionExpiry ? new Date(body.subscriptionExpiry) : null;
    }

    // Any license-field change is recorded in the License history.
    const licenseChanged =
      (data.plan !== undefined && data.plan !== tenant.plan) ||
      (data.seats !== undefined && data.seats !== tenant.seats) ||
      (data.subscriptionExpiry !== undefined &&
        String(data.subscriptionExpiry ?? "") !== String(tenant.subscriptionExpiry ?? ""));

    const updated = await prisma.tenant.update({
      where: { id },
      data,
    });

    if (licenseChanged) {
      await prisma.license.create({
        data: {
          tenantId: id,
          plan: updated.plan,
          seats: updated.seats,
          expiresAt: updated.subscriptionExpiry,
          note: body.licenseNote || `License updated by super admin`,
          createdBy: sa.sub,
        },
      });
      // Apply plan defaults to modules on plan change (admins can still fine-tune).
      if (data.plan !== undefined) {
        await syncModulesToPlan(id, String(data.plan));
      }
    }

    invalidateTenantAccess(id);
    return NextResponse.json({ tenant: updated });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to update tenant.";
    const status = message === "unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    await prisma.tenant.delete({ where: { id } });
    invalidateTenantAccess(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to delete tenant.";
    const status = message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Re-point the tenant's module flags to a plan's defaults. */
async function syncModulesToPlan(tenantId: string, planKey: string) {
  const defaults = (await getEffectivePlan(planKey)).modules;
  await prisma.$transaction(
    MODULES.map((m) =>
      prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId, module: m.key } },
        update: { enabled: defaults.includes(m.key) },
        create: { tenantId, module: m.key, enabled: defaults.includes(m.key) },
      })
    )
  );
}
