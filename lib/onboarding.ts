import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { MODULES } from "./modules";
import { getEffectivePlan } from "./plans-server";
import { newWorkspacePayrollSettings } from "./payroll-policy";
import type { Prisma } from "@/generated/prisma/client";

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
    .slice(0, 32)
    .replace(/-$/, "");
}

/** Slugs reserved for platform routes — never handed out as workspace subdomains. */
const RESERVED_SLUGS = [
  "www",
  "api",
  "app",
  "admin",
  "login",
  "register",
  "employee",
  "superadmin",
  "support",
  "mail",
];

export function isValidWorkspaceSlug(slug: string): boolean {
  return slug.length >= 2 && !RESERVED_SLUGS.includes(slug) && slug === normalizeSlug(slug);
}

/** True when the slug is a valid subdomain label and not already taken. */
export async function slugAvailable(slug: string): Promise<boolean> {
  const s = normalizeSlug(slug);
  if (!isValidWorkspaceSlug(s)) return false;
  const existing = await prisma.tenant.findUnique({ where: { slug: s }, select: { id: true } });
  return !existing;
}

export async function createWorkspaceDefaults(tx: Prisma.TransactionClient, tenantId: string) {
  const location = await tx.location.create({ data: { tenantId, name: "Main Office", code: "MAIN" } });
  const branch = await tx.branch.create({
    data: { tenantId, name: "Main Branch", code: "MAIN", locationId: location.id, isDefault: true },
  });
  const shift = await tx.shift.create({
    data: { tenantId, name: "General Shift", startTime: "09:00", endTime: "18:00", isDefault: true },
  });
  await tx.leaveType.createMany({
    data: [
      { tenantId, name: "Casual Leave", code: "CL", maxDays: 12, paid: true, color: "#3b82f6" },
      { tenantId, name: "Sick Leave", code: "SL", maxDays: 10, paid: true, color: "#f59e0b" },
      { tenantId, name: "Annual Leave", code: "AL", maxDays: 15, paid: true, color: "#10b981" },
    ],
  });
  return { branch, shift };
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
  const slug = normalizeSlug(input.slug);
  if (!isValidWorkspaceSlug(slug)) {
    throw new Error("Please choose a valid subdomain.");
  }
  const companyName = input.companyName.trim();
  const name = input.name.trim();
  if (!companyName || companyName.length > 120 || !name || name.length > 120) {
    throw new Error("Enter a company name and your full name, up to 120 characters each.");
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid work email address.");
  }
  if (input.password.length < 6 || Buffer.byteLength(input.password, "utf8") > 72) {
    throw new Error("Use at least 6 characters and up to 72 UTF-8 bytes for your password.");
  }

  const trial = await getEffectivePlan("trial");
  if (trial.trialDays <= 0) throw new Error("Self-service trials are currently unavailable.");
  const password = await hashPassword(input.password);
  const subscriptionExpiry = new Date(Date.now() + trial.trialDays * 86_400_000);
  const [firstName, ...lastName] = name.split(/\s+/);
  // Company codes are random — retry the whole signup transaction on a code
  // collision (P2002) so a rare clash doesn't fail onboarding.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const slugTaken = await tx.tenant.findUnique({ where: { slug }, select: { id: true } });
        if (slugTaken) throw new Error("That subdomain is already taken. Try another one.");

        const tenant = await tx.tenant.create({
          data: {
            name: companyName,
            code: generateCompanyCode(),
            slug,
            email,
            status: "active",
            plan: "trial",
            seats: trial.seats,
            subscriptionExpiry,
            config: newWorkspacePayrollSettings(),
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
            expiresAt: subscriptionExpiry,
            note: `Self-serve signup (${trial.trialDays}-day trial)`,
          },
        });

        const { branch, shift } = await createWorkspaceDefaults(tx, tenant.id);

        const admin = await tx.employee.create({
          data: {
            tenantId: tenant.id,
            employeeNumber: "ADM-001",
            firstName,
            lastName: lastName.join(" "),
            email,
            password,
            role: "admin",
            branchId: branch.id,
            shiftId: shift.id,
          },
        });

        return { tenant, admin };
      });
    } catch (err: unknown) {
      const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: string }).code : undefined;
      if (code !== "P2002") throw err;
      if (!(await slugAvailable(slug))) throw new Error("That subdomain is already taken. Try another one.");
    }
  }
  throw new Error("Failed to generate a unique company code. Please retry.");
}
