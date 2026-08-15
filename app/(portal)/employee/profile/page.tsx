import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { Package } from "lucide-react";
import { PageHeader, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function EmployeeProfilePage() {
  const session = await requireSession();
  const lang = await getLang();
  const [employee, myAssets] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: session.sub },
      include: { branch: true, department: true, shift: true, tenant: true },
    }),
    prisma.assetAssignment.findMany({
      where: { employeeId: session.sub, returnedAt: null },
      include: { asset: { select: { id: true, name: true, tag: true, category: true, serialNumber: true } } },
      orderBy: { assignedAt: "desc" },
    }),
  ]);
  if (!employee) return null;

  const fields = [
    { label: t(lang, "profile.employeeId"), value: employee.employeeNumber },
    { label: t(lang, "profile.email"), value: employee.email },
    { label: t(lang, "profile.phone"), value: employee.phone || "—" },
    { label: t(lang, "profile.position"), value: employee.position || "—" },
    { label: t(lang, "profile.department"), value: employee.department?.name ?? t(lang, "profile.unassigned") },
    { label: t(lang, "profile.branch"), value: employee.branch?.name ?? "—" },
    { label: t(lang, "profile.shift"), value: employee.shift ? `${employee.shift.name} (${employee.shift.startTime}–${employee.shift.endTime})` : "—" },
    { label: t(lang, "profile.joiningDate"), value: employee.joiningDate ? formatDate(employee.joiningDate) : "—" },
    { label: t(lang, "profile.lastLogin"), value: employee.lastLoginAt ? formatDate(employee.lastLoginAt) : "—" },
    { label: t(lang, "profile.company"), value: employee.tenant.name },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t(lang, "profile.title")} />
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
                <Badge tone="violet">{employee.role === "admin" ? t(lang, "profile.administrator") : t(lang, "profile.employee")}</Badge>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <div key={f.label} className="border-t border-edge pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.label}</p>
                <p className="mt-1 text-[13.5px] font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
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
      </Card>
    </div>
  );
}
