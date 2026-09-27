import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ArrowUpRight, Building2, CalendarClock, FileText, Landmark, MapPin, Network, ShieldCheck, UsersRound } from "lucide-react";
import { SettingsWorkspace } from "@/components/settings-workspace";

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
    ["Company Profile", "/admin/configuration", profile ? "Configured" : "Needs attention", "Legal identity, contacts, logo, and tenant defaults.", Building2],
    ["Locations & Legal Entities", "/admin/locations", locations ? `${locations} location${locations === 1 ? "" : "s"}` : "Needs attention", "Location records and location-specific legal details.", MapPin],
    ["Attendance Rules", "/admin/shifts", shifts ? `${shifts} shift${shifts === 1 ? "" : "s"}` : "Needs attention", "Operational shifts and attendance controls.", CalendarClock],
    ["Leave Policies", "/admin/configuration", leave ? "Published policy" : "Needs attention", "Effective-dated leave policy drafts and allocation periods.", ShieldCheck],
    ["Payroll Setup", "/admin/payroll/configuration", payroll ? "Published policy" : "Needs attention", "Future-draft payroll rules, location overrides, and review history.", Landmark],
    ["Departments & Designations", "/admin/departments", departments || designations ? `${departments} departments · ${designations} designations` : "Needs attention", "Organisation structure used by people records.", UsersRound],
    ["Documents & Branding", "/admin/documents", documents ? `${documents} document${documents === 1 ? "" : "s"}` : "Optional", "Managed documents, company brand assets, and ID-card templates.", FileText],
    ["Policies & Acknowledgements", "/admin/policies", policies ? `${policies} polic${policies === 1 ? "y" : "ies"}` : "Optional", "Published workforce policies and acknowledgement tracking.", ShieldCheck],
    ["Integrations", "/admin/webhooks", integrations ? `${integrations} webhook${integrations === 1 ? "" : "s"}` : "Optional", "Webhook integration endpoints. Device integrations remain in Devices.", Network],
  ] as const;
  const complete = [profile, locations > 0, shifts > 0, leave > 0, payroll > 0].filter(Boolean).length;
  return <SettingsWorkspace title="Company settings" description="Manage the operational foundations for PeopleNexa. This setup guide is optional and never blocks existing work." progress={{ label: "Setup progress", complete, total: 5, detail: "Tenant defaults and published location overrides continue to apply without changing historic records." }}><section aria-labelledby="settings-directory"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 id="settings-directory" className="font-display text-lg font-semibold">Settings directory</h2><p className="mt-1 text-sm text-muted-foreground">Open a section to manage its existing configuration.</p></div><Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href="/admin/configuration">Open configuration editor</Link></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sections.map(([title, href, state, help, Icon]) => <Link key={title} href={href} className="group min-h-[176px] rounded-2xl border border-edge bg-card p-5 transition-colors hover:border-primary/35 hover:bg-tint"><div className="flex items-start justify-between gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden="true" className="h-5 w-5" /></span><ArrowUpRight aria-hidden="true" className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">{state}</p><h2 className="mt-1 font-display text-base font-semibold">{title}</h2><p className="mt-1.5 text-sm leading-5 text-muted-foreground">{help}</p></Link>)}</div></section></SettingsWorkspace>;
}
