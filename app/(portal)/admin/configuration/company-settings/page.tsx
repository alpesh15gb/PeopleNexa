import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const session = await requireSession();
  if (session.role !== "admin") return null;
  const [profile, locations, shifts, leave, payroll, departments, designations, documents, policies, integrations] = await Promise.all([
    prisma.tenantProfile.findUnique({ where: { tenantId: session.tenantId }, select: { id: true } }),
    prisma.location.count({ where: { tenantId: session.tenantId } }), prisma.shift.count({ where: { tenantId: session.tenantId } }),
    prisma.configurationRecord.count({ where: { tenantId: session.tenantId, kind: "leave_policy", active: true } }), prisma.configurationRecord.count({ where: { tenantId: session.tenantId, kind: "payroll_policy", active: true } }),
    prisma.department.count({ where: { tenantId: session.tenantId } }), prisma.designation.count({ where: { tenantId: session.tenantId, active: true } }),
    prisma.document.count({ where: { tenantId: session.tenantId } }), prisma.policy.count({ where: { tenantId: session.tenantId } }),
    prisma.webhookEndpoint.count({ where: { tenantId: session.tenantId } }),
  ]);
  const sections = [
    ["Company Profile", "/admin/configuration", profile ? "Configured" : "Needs attention", "Legal identity, contacts, logo, and tenant defaults."],
    ["Locations & Legal Entities", "/admin/locations", locations ? `${locations} location${locations === 1 ? "" : "s"}` : "Needs attention", "Location records and location-specific legal details."],
    ["Attendance Rules", "/admin/shifts", shifts ? `${shifts} shift${shifts === 1 ? "" : "s"}` : "Needs attention", "Operational shifts and attendance controls. Existing attendance remains unchanged."],
    ["Leave Policies", "/admin/configuration", leave ? "Published policy" : "Needs attention", "Effective-dated leave policy drafts and allocation periods."],
    ["Payroll Setup", "/admin/payroll/configuration", payroll ? "Published policy" : "Needs attention", "Future-draft payroll rules, location overrides, and review history."],
    ["Departments & Designations", "/admin/departments", departments || designations ? `${departments} departments · ${designations} designations` : "Needs attention", "Organisation structure used by people records."],
    ["Documents & Branding", "/admin/documents", documents ? `${documents} document${documents === 1 ? "" : "s"}` : "Optional", "Managed documents, company brand assets, and ID-card templates."],
    ["Policies & Acknowledgements", "/admin/policies", policies ? `${policies} polic${policies === 1 ? "y" : "ies"}` : "Optional", "Published workforce policies and acknowledgement tracking."],
    ["Integrations", "/admin/webhooks", integrations ? `${integrations} webhook${integrations === 1 ? "" : "s"}` : "Optional", "Webhook integration endpoints. Device integrations remain in Devices."],
  ] as const;
  const complete = [profile, locations > 0, shifts > 0, leave > 0, payroll > 0].filter(Boolean).length;
  return <div className="animate-fade-up space-y-6"><PageHeader title="Company Settings" description="A non-blocking configuration workspace. Tenant defaults apply unless an effective location override is published; historic payroll, leave, attendance, and policy records remain snapshots." /><Card><CardHeader><CardTitle>Setup checklist</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{complete} of 5 operational foundations configured. This is guidance only; it does not prevent existing work.</p><div className="mt-4 grid gap-2 sm:grid-cols-5">{["Profile", "Locations", "Attendance", "Leave", "Payroll"].map((label, index) => <span key={label} className={`rounded-lg border p-3 text-sm ${[profile, locations > 0, shifts > 0, leave > 0, payroll > 0][index] ? "border-emerald-500/30 bg-emerald-500/10" : "border-edge bg-tint"}`}>{label}: {[profile, locations > 0, shifts > 0, leave > 0, payroll > 0][index] ? "Ready" : "Attention"}</span>)}</div></CardContent></Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sections.map(([title, href, state, help]) => <Link key={title} href={href} className="block rounded-xl border border-edge bg-card p-5 transition-colors hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{state}</p><h2 className="mt-2 font-display text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{help}</p><span className="mt-4 inline-block text-sm font-medium text-primary">Open settings</span></Link>)}</div><p className="text-sm text-muted-foreground">Need the full legacy configuration editor? <Link className="font-medium text-primary underline" href="/admin/configuration">Open Configuration</Link>. Existing URLs remain available.</p></div>;
}
