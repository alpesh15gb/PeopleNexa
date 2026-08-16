import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/lib/prisma";
import { PLANS, MODULES } from "@/lib/modules";
import { getEffectivePlan } from "@/lib/plans-server";
import { generateCompanyCode, normalizeSlug } from "@/lib/onboarding";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    await requireSuperAdmin();
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: { select: { employees: true } },
        modules: { select: { module: true, enabled: true } },
        licenses: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      tenants: tenants.map(({ licenses, modules, _count, ...t }) => ({
        ...t,
        employeeCount: _count.employees,
        enabledModules: modules.filter((m) => m.enabled).map((m) => m.module),
        currentLicense: licenses[0] ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to load tenants.";
    const status = message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sa = await requireSuperAdmin();
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const slug = normalizeSlug(String(body.slug ?? ""));
    const planKey = String(body.plan ?? "trial");
    const effectivePlan = await getEffectivePlan(planKey);
    const seats = Number(body.seats ?? effectivePlan.seats) || effectivePlan.seats;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const adminEmail = String(body.adminEmail ?? "").toLowerCase().trim();
    const adminPassword = String(body.adminPassword ?? "");

    if (!name || !slug) {
      return NextResponse.json({ error: "Company name and subdomain are required." }, { status: 400 });
    }
    if (!PLANS.some((p) => p.key === planKey)) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }
    const slugTaken = await prisma.tenant.findUnique({ where: { slug } });
    if (slugTaken) {
      return NextResponse.json({ error: "That subdomain is already taken." }, { status: 400 });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        code: generateCompanyCode(),
        slug,
        email: body.email || null,
        phone: body.phone || null,
        plan: planKey,
        seats,
        subscriptionExpiry: expiresAt,
        status: body.status === "suspended" ? "suspended" : "active",
      },
    });

    // Enable the plan's modules for the tenant.
    await prisma.tenantModule.createMany({
      data: MODULES.map((m) => ({
        tenantId: tenant.id,
        module: m.key,
        enabled: effectivePlan.modules.includes(m.key),
      })),
    });

    await prisma.license.create({
      data: {
        tenantId: tenant.id,
        plan: planKey,
        seats,
        expiresAt,
        note: body.licenseNote || `Manual signup (${planKey})`,
        createdBy: sa.sub,
      },
    });

    let admin = null;
    if (adminEmail && adminPassword) {
      const branch = await prisma.branch.create({
        data: { tenantId: tenant.id, name: "Main Branch", code: "MAIN", isDefault: true },
      });
      admin = await prisma.employee.create({
        data: {
          tenantId: tenant.id,
          employeeNumber: "ADM-001",
          firstName: name,
          lastName: "Admin",
          email: adminEmail,
          password: await hashPassword(adminPassword),
          role: "admin",
          branchId: branch.id,
        },
        select: { id: true, email: true },
      });
    }

    return NextResponse.json({ tenant, admin }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error && err.message === "unauthorized" ? "unauthorized" : "Failed to create tenant.";
    const status = message === "unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
