import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { MODULES } from "./modules";
import { getEffectivePlan } from "./plans-server";

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

/** True when the slug is a valid subdomain label and not already taken. */
export async function slugAvailable(slug: string): Promise<boolean> {
  const s = normalizeSlug(slug);
  if (!s || s.length < 2 || RESERVED_SLUGS.includes(s)) return false;
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
  const slug = normalizeSlug(input.slug);
  if (!slug || slug.length < 2 || RESERVED_SLUGS.includes(slug)) {
    throw new Error("Please choose a valid subdomain.");
  }
  if (!input.companyName.trim() || !input.name.trim() || !email || input.password.length < 6) {
    throw new Error("Please complete all required fields.");
  }

  const trial = await getEffectivePlan("trial");
  // Company codes are random — retry the whole signup transaction on a code
  // collision (P2002) so a rare clash doesn't fail onboarding.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
    const [existing, slugTaken] = await Promise.all([
      tx.employee.findFirst({ where: { email }, include: { tenant: true } }),
      tx.tenant.findUnique({ where: { slug } }),
    ]);
    if (existing) throw new Error("An account with this email already exists.");
    if (slugTaken) throw new Error("That subdomain is already taken. Try another one.");

    const subscriptionExpiry = new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000);
    const tenant = await tx.tenant.create({
      data: {
        name: input.companyName.trim(),
        code: generateCompanyCode(),
        slug,
        email,
        status: "active",
        plan: "trial",
        seats: trial.seats,
        subscriptionExpiry,
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
        expiresAt: subscriptionExpiry,
        note: "Self-serve signup (30-day trial)",
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

    const admin = await tx.employee.create({
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
      });
    } catch (err: unknown) {
      const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: string }).code : undefined;
      const target = typeof err === "object" && err !== null && "meta" in err ? String((err as { meta?: { target?: unknown } }).meta?.target ?? "") : "";
      // Only retry unique-constraint failures on the tenant code; email/slug
      // conflicts already throw friendly errors above and must surface.
      if (code === "P2002" && target.includes("code")) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to generate a unique company code. Please retry.");
}
