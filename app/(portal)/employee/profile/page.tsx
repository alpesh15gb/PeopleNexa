import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { Package } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { getTenantAccess } from "@/lib/modules-server";
import { workspaceRegion } from "@/lib/workspace-region";
import { formatCalendarDate } from "@/lib/workspace-time";
import { istDateKey } from "@/lib/ist";

export const dynamic = "force-dynamic";

export default async function EmployeeProfilePage() {
  const session = await requireSession();
  const [lang, access, employee] = await Promise.all([
    getLang(),
    getTenantAccess(session.tenantId),
    prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      include: {
        branch: { select: { name: true } },
        department: { select: { name: true } },
        shift: { select: { name: true, startTime: true, endTime: true } },
        tenant: { select: { name: true, config: true } },
        manager: { select: { firstName: true, lastName: true, tenantId: true } },
      },
    }),
  ]);
  if (!employee) redirect("/login");
  const region = workspaceRegion(employee.tenant.config);
  const manager = employee.manager?.tenantId === session.tenantId ? employee.manager : null;
  const myAssets = access.modules.has("assets") ? await prisma.assetAssignment.findMany({
    where: { employeeId: employee.id, asset: { tenantId: session.tenantId }, returnedAt: null },
    include: { asset: { select: { name: true, tag: true, category: true } } },
    orderBy: { assignedAt: "desc" },
  }) : null;

  const employment = [
    { label: t(lang, "profile.employeeId"), value: employee.employeeNumber },
    { label: t(lang, "profile.position"), value: employee.position || "—" },
    { label: t(lang, "profile.department"), value: employee.department?.name ?? t(lang, "profile.unassigned") },
    { label: t(lang, "profile.branch"), value: employee.branch?.name ?? "—" },
    { label: t(lang, "profile.manager"), value: manager ? `${manager.firstName} ${manager.lastName}`.trim() : "—" },
    ...(access.modules.has("shifts") ? [{ label: t(lang, "profile.shift"), value: employee.shift ? `${employee.shift.name} (${employee.shift.startTime}–${employee.shift.endTime})` : "—" }] : []),
    { label: t(lang, "profile.joiningDate"), value: employee.joiningDate ? formatCalendarDate(istDateKey(employee.joiningDate), region.locale) : "—" },
    { label: t(lang, "profile.company"), value: employee.tenant.name },
  ];
  const account = [
    { label: t(lang, "profile.email"), value: employee.email && !employee.email.endsWith("@employees.peoplenexa.invalid") ? employee.email : "—" },
    { label: t(lang, "profile.phone"), value: employee.phone || "—" },
    { label: t(lang, "profile.lastLogin"), value: employee.lastLoginAt ? new Intl.DateTimeFormat(region.locale, { timeZone: region.timeZone, dateStyle: "medium", timeStyle: "short" }).format(employee.lastLoginAt) : "—" },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t(lang, "profile.title")} description="Review your employment, contact, and account details." />
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-brand font-display text-2xl font-bold text-white shadow-[0_8px_30px_-8px_rgba(99,102,241,0.7)]">
              {(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">
                {employee.firstName} {employee.lastName}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {employee.position || t(lang, "profile.teamMember")} at {employee.tenant.name}
              </p>
              <div className="mt-2 flex gap-2">
                <Badge tone={employee.status === "active" ? "success" : "neutral"}>{employee.status}</Badge>
                {employee.role === "admin" && <Badge tone="violet">{t(lang, "profile.administrator")}</Badge>}
              </div>
            </div>
          </div>

          <h2 className="mt-8 text-base font-semibold">Employment</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {employment.map((f) => (
              <div key={f.label} className="border-t border-edge pt-3">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-wrap items-center">
          <CardTitle>Contact and sign-in</CardTitle>
          <Link href="/change-password" className="rounded-lg border border-edge px-3 py-2 text-sm font-medium hover:bg-tint">Change password</Link>
        </CardHeader>
        <CardContent className="p-6 pt-3">
          <dl className="grid gap-4 sm:grid-cols-3">
            {account.map((field) => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 break-words text-sm font-medium">{field.value}</dd></div>)}
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">Ask HR to update a work or contact detail. {access.modules.has("helpdesk") && <Link href="/employee/helpdesk" className="font-medium text-primary hover:underline">Open Helpdesk</Link>}</p>
        </CardContent>
      </Card>

      {myAssets && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-indigo-300" /> {t(lang, "profile.myAssets")}
          </CardTitle>
          <CardDescription>{t(lang, "profile.assetsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {myAssets.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t(lang, "profile.noAssets")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {myAssets.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-edge bg-tint px-4 py-3.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
                    <Package className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{a.asset.name}</p>
                    <p className="text-[11.5px] capitalize text-muted-foreground">
                      {a.asset.tag ?? "—"} · {a.asset.category.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <Badge tone="info">{t(lang, "profile.assigned")}</Badge>
                    <p className="mt-1 text-[10.5px] text-muted-foreground">{formatDate(a.assignedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}
