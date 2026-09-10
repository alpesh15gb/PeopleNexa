import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { getSession } from "@/lib/session";
import { getLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/ui/toast";
import { PWARegister } from "@/components/pwa-register";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [employee, tenantModules] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      include: { tenant: true },
    }),
    prisma.tenantModule.findMany({
      where: { tenantId: session.tenantId, enabled: true },
      select: { module: true },
    }),
  ]);
  // Inactive / deleted employees must not retain portal access (tokens live 30d).
  if (!employee || employee.status !== "active") redirect("/login");

  // Location → branch tree for the left pane (oversight roles only; one
  // small indexed query, skipped for employees and branch managers).
  const locationTree =
    employee.role === "admin" || employee.role === "supervisor" || employee.role === "location_manager"
      ? await prisma.location.findMany({
          where: { tenantId: session.tenantId, ...(employee.role === "location_manager" ? { id: employee.locationId ?? "__none__" } : {}) },
          select: {
            id: true,
            name: true,
            branches: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const name = `${employee.firstName} ${employee.lastName}`.trim() || "User";
  const lang = await getLang();
  const enabledModules = tenantModules.map((m) => m.module);

  return (
    <ToastProvider>
      <PWARegister />
      <Shell role={employee.role} name={name} companyName={employee.tenant.name} lang={lang} enabledModules={enabledModules} locationTree={locationTree}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
