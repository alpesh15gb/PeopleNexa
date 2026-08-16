/**
 * Product catalog for tenant plans & modules.
 *
 * Plans are the license tiers a tenant can be on; each plan implies a module
 * set and a seat limit. Super admins can additionally fine-tune individual
 * modules per tenant (TenantModule rows) — the plan is the default, modules
 * are the live truth.
 *
 * NOTE: this module is imported by client components (superadmin panels), so
 * it must stay free of server-only imports (prisma, fs, etc.). The DB-backed
 * access helper lives in lib/modules-server.ts.
 */

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
}

export const MODULES: ModuleDef[] = [
  { key: "attendance", label: "Attendance", description: "Clock-in/out, daily marking, geofenced punches" },
  { key: "employees", label: "Employees", description: "Employee records & profiles" },
  { key: "leaves", label: "Leaves", description: "Leave types, requests, balances" },
  { key: "holidays", label: "Holidays", description: "Company holiday calendar" },
  { key: "shifts", label: "Shifts", description: "Shift definitions & rosters" },
  { key: "branches", label: "Branches", description: "Branches & geofence setup" },
  { key: "assets", label: "Assets", description: "Asset tracking & assignments" },
  { key: "devices", label: "Devices", description: "Biometric device integration" },
  { key: "payroll", label: "Payroll", description: "Payslips, statutory calc, bank files" },
  { key: "expenses", label: "Expenses", description: "Expense & reimbursement claims" },
  { key: "reports", label: "Reports", description: "Analytics & exports" },
  { key: "journey", label: "Journey Tracker", description: "Field GPS tracking & route replay" },
  { key: "ai", label: "Ask AI", description: "Natural-language answers over your data" },
  { key: "documents", label: "Documents", description: "Employee documents & expiry alerts" },
  { key: "performance", label: "Performance", description: "KPIs, appraisals & 360° feedback" },
  { key: "helpdesk", label: "Helpdesk", description: "Employee tickets & support" },
  { key: "feed", label: "Org Feed", description: "Announcements & posts" },
  { key: "policies", label: "Policies", description: "Company policy library" },
  { key: "rosters", label: "Rosters", description: "Shift rosters, weekly schedules & bulk assignment" },
  { key: "orgchart", label: "Org Chart", description: "Visual reporting structure" },
  { key: "onboarding", label: "Onboarding", description: "First-day checklists & joining tasks" },
  { key: "exit", label: "Exit Management", description: "Resignations, notice periods & full & final" },
  { key: "platform", label: "Platform", description: "Webhooks, integrations & device health" },
];

export interface PlanDef {
  key: string;
  label: string;
  seats: number;
  /** Monthly price per seat in INR (0 = free / custom). */
  pricePerSeat: number;
  /** Monthly-equivalent per seat when billed annually (0 = free / custom). */
  annualPricePerSeat: number;
  /** Free trial length in days for self-serve signups. */
  trialDays: number;
  /** Modules included in this plan by default. */
  modules: string[];
  blurb: string;
}

export const PLANS: PlanDef[] = [
  {
    key: "trial",
    label: "Trial",
    seats: 10,
    pricePerSeat: 0,
    annualPricePerSeat: 0,
    trialDays: 30,
    modules: MODULES.map((m) => m.key),
    blurb: "Free 30-day trial — everything enabled",
  },
  {
    key: "starter",
    label: "Starter",
    seats: 10,
    pricePerSeat: 39,
    annualPricePerSeat: 31,
    trialDays: 30,
    modules: ["attendance", "employees", "leaves", "holidays", "shifts", "branches"],
    blurb: "Core HR & attendance",
  },
  {
    key: "growth",
    label: "Growth",
    seats: 50,
    pricePerSeat: 69,
    annualPricePerSeat: 55,
    trialDays: 30,
    modules: ["attendance", "employees", "leaves", "holidays", "shifts", "branches", "payroll", "expenses", "reports", "documents", "rosters", "orgchart"],
    blurb: "Adds payroll, expenses, reports, rosters & org chart",
  },
  {
    key: "pro",
    label: "Pro",
    seats: 200,
    pricePerSeat: 99,
    annualPricePerSeat: 79,
    trialDays: 30,
    modules: ["attendance", "employees", "leaves", "holidays", "shifts", "branches", "payroll", "expenses", "reports", "assets", "devices", "journey", "ai", "documents", "performance", "helpdesk", "feed", "policies", "rosters", "orgchart", "onboarding", "exit", "platform"],
    blurb: "Everything included",
  },
  {
    key: "enterprise",
    label: "Enterprise",
    seats: 1000,
    pricePerSeat: 0,
    annualPricePerSeat: 0,
    trialDays: 0,
    modules: MODULES.map((m) => m.key),
    blurb: "Custom contracts & dedicated support",
  },
];

/** Annual per-seat rate if it beats monthly; falls back to monthly × 12. */
export function planMonthlyPrice(plan: PlanDef): number {
  return plan.pricePerSeat;
}

export function planAnnualPrice(plan: PlanDef): number {
  return plan.annualPricePerSeat > 0 ? plan.annualPricePerSeat : plan.pricePerSeat;
}

export const planFor = (key: string): PlanDef => PLANS.find((p) => p.key === key) ?? PLANS[0];

export const moduleFor = (key: string): ModuleDef | undefined => MODULES.find((m) => m.key === key);

/** Path prefixes mapped to the module they belong to (pages + APIs). */
const ROUTE_MODULES: Array<[string, string]> = [
  ["/admin/attendance", "attendance"],
  ["/admin/employees", "employees"],
  ["/admin/leaves", "leaves"],
  ["/admin/holidays", "holidays"],
  ["/admin/shifts", "shifts"],
  ["/admin/rosters", "rosters"],
  ["/admin/org-chart", "orgchart"],
  ["/admin/onboarding", "onboarding"],
  ["/admin/exits", "exit"],
  ["/admin/webhooks", "platform"],
  ["/admin/device-health", "platform"],
  ["/admin/branches", "branches"],
  ["/admin/assets", "assets"],
  ["/admin/devices", "devices"],
  ["/admin/payroll", "payroll"],
  ["/admin/loans", "payroll"],
  ["/admin/tax", "payroll"],
  ["/admin/reports", "reports"],
  ["/admin/whatsapp", "platform"],
  ["/admin/expenses", "expenses"],
  ["/admin/regularization", "attendance"],
  ["/admin/journeys", "journey"],
  ["/admin/ai", "ai"],
  ["/admin/documents", "documents"],
  ["/admin/performance", "performance"],
  ["/admin/helpdesk", "helpdesk"],
  ["/admin/policies", "policies"],
  ["/employee/attendance", "attendance"],
  ["/employee/documents", "documents"],
  ["/employee/performance", "performance"],
  ["/employee/helpdesk", "helpdesk"],
  ["/employee/feed", "feed"],
  ["/employee/policies", "policies"],
  ["/employee/leaves", "leaves"],
  ["/employee/payslips", "payroll"],
  ["/employee/tax", "payroll"],
  ["/employee/expenses", "expenses"],
  ["/api/attendance", "attendance"],
  ["/api/employees", "employees"],
  ["/api/leaves", "leaves"],
  ["/api/holidays", "holidays"],
  ["/api/shifts", "shifts"],
  ["/api/branches", "branches"],
  ["/api/assets", "assets"],
  ["/api/devices", "devices"],
  ["/api/payroll", "payroll"],
  ["/api/loans", "payroll"],
  ["/api/expenses", "expenses"],
  ["/api/attendance/corrections", "attendance"],
  ["/api/reports", "reports"],
  ["/api/location", "journey"],
  ["/api/journeys", "journey"],
  ["/api/ai", "ai"],
  ["/api/documents", "documents"],
  ["/api/performance", "performance"],
  ["/api/helpdesk", "helpdesk"],
  ["/api/feed", "feed"],
  ["/api/policies", "policies"],
  ["/api/rosters", "rosters"],
  ["/api/onboarding", "onboarding"],
  ["/api/exits", "exit"],
  ["/api/webhooks", "platform"],
  ["/api/device-health", "platform"],
  ["/api/employees/org-chart", "orgchart"],
];

/** Which module (if any) a path belongs to. */
export function moduleForPath(pathname: string): string | null {
  for (const [prefix, module] of ROUTE_MODULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return module;
  }
  return null;
}
