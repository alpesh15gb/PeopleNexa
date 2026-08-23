import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { MODULES } from "./modules";
import { getEffectivePlan } from "./plans-server";
import { toDateKey } from "./dates";

const TRIAL_DAYS = 30;
const RESERVED_SLUGS = new Set(["www", "api", "admin", "app", "superadmin", "mail", "support", "status"]);

/** Generate a corporate-style code, e.g. CP2608230012. */
export function generateCompanyCode(): string {
  const stamp = toDateKey(new Date()).replaceAll("-", "").slice(2);
  return `CP${stamp}${String(randomInt(0, 10000)).padStart(4, "0")}`;
}

export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function isValidWorkspaceSlug(raw: string): boolean {
  const slug = normalizeSlug(raw);
  return slug.length >= 2 && slug.length <= 32 && !RESERVED_SLUGS.has(slug) && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug);
}

export async function slugAvailable(slug: string): Promise<boolean> {
  const s = normalizeSlug(slug);
  if (!isValidWorkspaceSlug(s)) return false;
  const existing = await prisma.tenant.findUnique({ where: { slug: s } });
  return !existing;
}

/**
 * Create the tenant and every required default in a single transaction. No
 * partially-created workspace is left behind if any step fails.
 */
export async function onboardTenant(input: {
  companyName: string;
  slug: string;
  name: string;
  email: string;
  password: string;
}) {
  const companyName = input.companyName.trim();
  const ownerName = input.name.trim();
  const email = input.email.toLowerCase().trim();
  const slug = normalizeSlug(input.slug);

  if (!isValidWorkspaceSlug(slug)) throw new Error("Please choose a valid subdomain.");

  const [existing, slugTaken, trial, passwordHash] = await Promise.all([
    prisma.employee.findFirst({ where: { email }, select: { id: true } }),
    prisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
    getEffectivePlan("trial"),
    hashPassword(input.password),
  ]);
  if (existing) throw new Error("An account with this email already exists.");
  if (slugTaken) throw new Error("That subdomain is already taken. Try another one.");

  const expiry = new Date(Date.now() + TRIAL_DAYS * 86400000);

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
        code: generateCompanyCode(),
        slug,
        email,
        status: "active",
        plan: "trial",
        seats: trial.seats,
        subscriptionExpiry: expiry,
        config: {},
      },
    });

    await tx.tenantModule.createMany({
      data: MODULES.map((m) => ({ tenantId: tenant.id, module: m.key, enabled: trial.modules.includes(m.key) })),
    });
    await tx.license.create({
      data: {
        tenantId: tenant.id,
        plan: "trial",
        seats: trial.seats,
        expiresAt: tenant.subscriptionExpiry,
        note: `Self-serve signup (${TRIAL_DAYS}-day trial)`,
      },
    });

    const branch = await tx.branch.create({
      data: {
        tenantId: tenant.id,
        name: "Main Branch",
        code: "MAIN",
        geofenceRadius: 200,
        isDefault: true,
      },
    });

    const shift = await tx.shift.create({
      data: {
        tenantId: tenant.id,
        name: "General Shift",
        startTime: "09:00",
        endTime: "18:00",
        graceMinutes: 15,
        isDefault: true,
      },
    });

    await tx.leaveType.createMany({
      data: [
        { tenantId: tenant.id, name: "Casual Leave", code: "CL", maxDays: 12, color: "#3b82f6" },
        { tenantId: tenant.id, name: "Sick Leave", code: "SL", maxDays: 10, color: "#f59e0b" },
        { tenantId: tenant.id, name: "Privilege Leave", code: "PL", maxDays: 15, color: "#10b981" },
      ],
    });

    const parts = ownerName.split(/\s+/).filter(Boolean);
    const admin = await tx.employee.create({
      data: {
        tenantId: tenant.id,
        employeeNumber: "ADM-001",
        firstName: parts[0] || "Admin",
        lastName: parts.slice(1).join(" "),
        email,
        password: passwordHash,
        role: "admin",
        branchId: branch.id,
        shiftId: shift.id,
        joiningDate: new Date(),
      },
    });

    return { tenant, admin };
  });
}
