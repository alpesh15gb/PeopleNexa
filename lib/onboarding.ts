import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { MODULES, planFor } from "./modules";

/** Days a new trial license runs. */
const TRIAL_DAYS = 30;

/** Generate a corporate-style code, e.g. CP26080012. */
export function generateCompanyCode(): string {
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `CP${stamp}${rand}`;
}

/** Normalize a subdomain slug: lowercase, alphanumeric + dashes, max 32 chars. */
export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

/** True when the slug is a valid subdomain label and not already taken. */
export async function slugAvailable(slug: string): Promise<boolean> {
  const s = normalizeSlug(slug);
  if (!s || s.length < 2 || s === "www" || s === "api" || s === "admin" || s === "app") return false;
  const existing = await prisma.tenant.findUnique({ where: { slug: s } });
  return !existing;
}

/**
 * Set up a brand-new tenant: tenant (company), default branch, general shift,
 * standard leave types and the admin employee.
 */
export async function onboardTenant(input: {
  companyName: string;
  slug: string;
  name: string;
  email: string;
  password: string;
}) {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.employee.findFirst({
    where: { email },
    include: { tenant: true },
  });
  if (existing) throw new Error("An account with this email already exists.");

  const slug = normalizeSlug(input.slug);
  if (!slug || slug.length < 2 || ["www", "api", "admin", "app"].includes(slug)) {
    throw new Error("Please choose a valid subdomain.");
  }
  const slugTaken = await prisma.tenant.findUnique({ where: { slug } });
  if (slugTaken) throw new Error("That subdomain is already taken. Try another one.");

  const trial = planFor("trial");
  const tenant = await prisma.tenant.create({
    data: {
      name: input.companyName.trim(),
      code: generateCompanyCode(),
      slug,
      email,
      status: "active",
      plan: "trial",
      seats: trial.seats,
      subscriptionExpiry: new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000),
      config: {},
    },
  });

  // Enable every module for the trial, and record the initial license.
  await prisma.tenantModule.createMany({
    data: MODULES.map((m) => ({ tenantId: tenant.id, module: m.key, enabled: trial.modules.includes(m.key) })),
  });
  await prisma.license.create({
    data: {
      tenantId: tenant.id,
      plan: "trial",
      seats: trial.seats,
      expiresAt: tenant.subscriptionExpiry,
      note: "Self-serve signup (30-day trial)",
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: "Main Branch",
      code: "MAIN",
      geofenceRadius: 200,
      isDefault: true,
    },
  });

  const shift = await prisma.shift.create({
    data: {
      tenantId: tenant.id,
      name: "General Shift",
      startTime: "09:00",
      endTime: "18:00",
      graceMinutes: 15,
      isDefault: true,
    },
  });

  await prisma.leaveType.createMany({
    data: [
      { tenantId: tenant.id, name: "Casual Leave", code: "CL", maxDays: 12, color: "#3b82f6" },
      { tenantId: tenant.id, name: "Sick Leave", code: "SL", maxDays: 10, color: "#f59e0b" },
      { tenantId: tenant.id, name: "Privilege Leave", code: "PL", maxDays: 15, color: "#10b981" },
    ],
  });

  const admin = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      employeeNumber: "ADM-001",
      firstName: input.name.trim().split(" ")[0] || "Admin",
      lastName: input.name.trim().split(" ").slice(1).join(" "),
      email,
      password: await hashPassword(input.password),
      role: "admin",
      branchId: branch.id,
      shiftId: shift.id,
    },
  });

  return { tenant, admin };
}
