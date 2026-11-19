import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/lib/prisma";
import { PLANS, MODULES } from "@/lib/modules";
import { getEffectivePlan } from "@/lib/plans-server";
import { isTransactionWriteConflict } from "@/lib/transaction-conflict";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      omit: { config: true },
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
    const body = (await req.json().catch(() => null)) ?? {};
    const data: Prisma.TenantUpdateInput = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (data.name === "") return NextResponse.json({ error: "Workspace name is required." }, { status: 400 });
    if (body.email !== undefined) data.email = body.email ? String(body.email) : null;
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone) : null;
    if (body.status !== undefined) {
      if (!["active", "suspended"].includes(body.status)) return NextResponse.json({ error: "Unknown workspace status." }, { status: 400 });
      data.status = body.status;
    }
    if (body.seats !== undefined) {
      const seats = Number(body.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 100000) {
        return NextResponse.json({ error: "Seats must be a positive integer." }, { status: 400 });
      }
      data.seats = seats;
    }
    if (body.subscriptionExpiry !== undefined) {
      const expiry = body.subscriptionExpiry ? new Date(body.subscriptionExpiry) : null;
      if (expiry && !Number.isFinite(expiry.getTime())) return NextResponse.json({ error: "Enter a valid subscription expiration date." }, { status: 400 });
      data.subscriptionExpiry = expiry;
    }
    if (body.plan !== undefined && !PLANS.some(({ key }) => key === body.plan)) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }
    const newPlan = body.plan !== undefined ? await getEffectivePlan(body.plan) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id }, select: { plan: true, seats: true, subscriptionExpiry: true } });
      if (!tenant) return null;
      const changedPlan = newPlan && newPlan.key !== tenant.plan ? newPlan : null;
      const result = await tx.tenant.update({
        where: { id },
        omit: { config: true },
        data: { ...data, ...(changedPlan ? { plan: changedPlan.key, seats: data.seats ?? changedPlan.seats } : {}) },
      });
      const licenseChanged = result.plan !== tenant.plan || result.seats !== tenant.seats ||
        result.subscriptionExpiry?.getTime() !== tenant.subscriptionExpiry?.getTime();
      if (licenseChanged) {
        await tx.license.create({
          data: {
            tenantId: id, plan: result.plan, seats: result.seats, expiresAt: result.subscriptionExpiry,
            note: typeof body.licenseNote === "string" && body.licenseNote.trim() ? body.licenseNote.trim() : "License updated by super admin",
            createdBy: sa.sub,
          },
        });
      }
      if (changedPlan) {
        for (const { key: module } of MODULES) {
          const enabled = changedPlan.modules.includes(module);
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: id, module } },
            update: { enabled },
            create: { tenantId: id, module, enabled },
          });
        }
      }
      return result;
    }, { isolationLevel: "Serializable", timeout: 15000 });
    if (!updated) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    return NextResponse.json({ tenant: updated });
  } catch (err) {
    if (isTransactionWriteConflict(err)) return NextResponse.json({ error: "Workspace settings changed. Refresh and try again." }, { status: 409 });
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
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to delete tenant.";
    const status = message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
