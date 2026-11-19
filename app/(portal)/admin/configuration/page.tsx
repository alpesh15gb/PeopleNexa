import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { ConfigurationManager, type ConfigurationSection } from "./configuration-manager";

export const dynamic = "force-dynamic";

const editorSections: { id: ConfigurationSection; label: string; href: string }[] = [
  { id: "all", label: "All editors", href: "/admin/configuration" },
  { id: "company", label: "Company profile", href: "/admin/configuration?section=company" },
  { id: "locations", label: "Location profiles", href: "/admin/configuration?section=locations" },
  { id: "dashboard", label: "Dashboard layouts", href: "/admin/configuration?section=dashboard" },
  { id: "id-cards", label: "ID-card templates", href: "/admin/configuration?section=id-cards" },
];

export default async function ConfigurationPage({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  const [session, params] = await Promise.all([requireActiveSession(), searchParams]);
  if (session.role !== "admin") redirect("/admin");
  const section = editorSections.find((item) => item.id === params.section)?.id ?? "all";
  const tenantId = session.tenantId;
  const recordKinds = section === "dashboard" ? ["dashboard"] : section === "id-cards" ? ["id_card"] : section === "all" ? ["dashboard", "id_card"] : [];
  const [tenant, locations, records, access] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, email: true, phone: true, address: true, profile: true } }),
    section === "company" ? [] : prisma.location.findMany({ where: { tenantId }, select: { id: true, name: true, code: true, profile: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    recordKinds.length ? prisma.configurationRecord.findMany({
      where: { tenantId, kind: { in: recordKinds } },
      include: { location: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }) : [],
    getTenantAccess(tenantId),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <Link href="/admin/configuration/company-settings" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Company settings
      </Link>
      <PageHeader title="Configuration editor" description={section === "all" ? "Manage workspace identity, dashboard layouts and ID-card templates." : undefined} />
      <nav aria-label="Configuration editors" className="flex flex-wrap gap-2 rounded-2xl border border-edge bg-card p-3">
        {editorSections.map((item) => (
          <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium ${section === item.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-tint"}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      <ConfigurationManager key={section} tenant={tenant} locations={locations} records={records} section={section} showPayroll={access.modules.has("payroll")} showLeave={access.modules.has("leaves")} />
    </div>
  );
}
