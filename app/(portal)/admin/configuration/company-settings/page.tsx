import { redirect } from "next/navigation";
import { Banknote, BookOpen, Building2, CalendarClock, CalendarDays, ClipboardCheck, FileText, Globe2, IdCard, LayoutDashboard, MapPin, Network, UsersRound, Webhook } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { workspaceRegion } from "@/lib/workspace-region";
import { SettingsDirectory, type SettingsService } from "../settings-directory";
import { WorkspaceRegionForm } from "./workspace-region-form";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const session = await requireActiveSession();
  if (session.role !== "admin") redirect("/admin");
  const tenantId = session.tenantId;
  const { modules } = await getTenantAccess(tenantId);
  const now = new Date();
  const [tenant, locations, shifts, policies, punch, attendance, correction] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, config: true, profile: { select: { legalName: true } } } }),
    prisma.location.count({ where: { tenantId, isActive: true } }),
    modules.has("shifts") ? prisma.shift.count({ where: { tenantId } }) : 0,
    modules.has("leaves") || modules.has("payroll") ? prisma.configurationRecord.groupBy({
      by: ["kind"],
      where: {
        tenantId,
        kind: { in: [...(modules.has("leaves") ? ["leave_policy"] : []), ...(modules.has("payroll") ? ["payroll_policy"] : [])] },
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      _count: { _all: true },
    }) : [],
    prisma.punch.findFirst({ where: { tenantId }, select: { id: true } }),
    prisma.attendance.findFirst({ where: { tenantId }, select: { id: true } }),
    prisma.punchCorrection.findFirst({ where: { tenantId }, select: { id: true } }),
  ]);

  const region = workspaceRegion(tenant.config);
  const policyCounts = new Map(policies.map(({ kind, _count }) => [kind, _count._all]));
  const activePolicies = (kind: string) => {
    const count = policyCounts.get(kind) ?? 0;
    return count ? `${count} active polic${count === 1 ? "y" : "ies"}` : undefined;
  };
  const services: SettingsService[] = [
    { id: "workspace", title: "Workspace", links: [
      { href: "/admin/configuration?section=company", title: "Company profile", description: "Legal identity, contacts, address and company logo.", detail: tenant.profile?.legalName ?? tenant.name, icon: Building2 },
      { href: "#regional-settings", title: "Region and time zone", description: "Country, currency, date formatting and the attendance clock.", detail: `${region.currency} · ${region.timeZone}`, icon: Globe2 },
      { href: "/admin/locations", title: "Locations", description: "Manage establishments and operating locations.", detail: `${locations} active location${locations === 1 ? "" : "s"}`, icon: MapPin },
      { href: "/admin/configuration?section=locations", title: "Location profiles", description: "Store contact, legal and branding details for each location.", icon: Building2 },
      { href: "/admin/configuration?section=dashboard", title: "Dashboard layouts", description: "Choose dashboard widgets for the workspace or for individual locations.", icon: LayoutDashboard },
    ] },
    { id: "people-services", title: "People and employee services", links: [
      { href: "/admin/departments", title: "Departments", description: "Maintain the teams used in employee profiles and reporting.", module: "employees", icon: UsersRound },
      { href: "/admin/designations", title: "Designations", description: "Manage job titles available on employee records.", module: "employees", icon: ClipboardCheck },
      { href: "/admin/documents", title: "Employee documents", description: "Record employee documents and track expiry dates.", module: "documents", icon: FileText },
      { href: "/admin/configuration?section=id-cards", title: "ID-card templates", description: "Manage front and back artwork for workspace and location ID cards.", module: "employees", icon: IdCard },
      { href: "/admin/policies", title: "Company policies", description: "Publish workforce policies to employee self-service.", module: "policies", icon: BookOpen },
    ] },
    { id: "time-and-leave", title: "Attendance and leave", links: [
      { href: "/admin/shifts", title: "Shifts and weekly offs", description: "Define shift hours, grace periods and weekly days off.", detail: `${shifts} shift${shifts === 1 ? "" : "s"}`, module: "shifts", icon: CalendarClock },
      { href: "/admin/holidays", title: "Holiday calendar", description: "Set dates that apply to attendance and leave calculations.", module: "holidays", icon: CalendarDays },
      { href: "/admin/leaves/policies", title: "Leave policies", description: "Manage entitlements, approval rules, carry forward and balances.", detail: activePolicies("leave_policy"), module: "leaves", icon: ClipboardCheck },
    ] },
    { id: "payroll-service", title: "Payroll", links: [
      { href: "/admin/payroll/configuration", title: "Payroll settings", description: "Configure pay schedules, salary components, deductions and contributions.", detail: activePolicies("payroll_policy"), module: "payroll", icon: Banknote },
    ] },
    { id: "integrations", title: "Integrations", links: [
      { href: "/admin/settings", title: "Workspace connections", description: "Configure eBioserver, face match and SMS notifications.", icon: Network },
      { href: "/admin/webhooks", title: "Webhooks", description: "Manage endpoints that receive workspace events.", module: "platform", icon: Webhook },
    ] },
  ];
  const enabledServices = services
    .map((service) => ({ ...service, links: service.links.filter(({ module }) => !module || modules.has(module)) }))
    .filter((service) => service.links.length > 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Company settings" description="Manage workspace details and configure each HR service." />
      <SettingsDirectory services={enabledServices} />
      <WorkspaceRegionForm initial={region} hasAttendance={Boolean(punch || attendance || correction)} />
    </div>
  );
}
