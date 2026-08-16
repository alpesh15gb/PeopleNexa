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
    prisma.employee.findUnique({
      where: { id: session.sub },
      include: { tenant: true },
    }),
    prisma.tenantModule.findMany({
      where: { tenantId: session.tenantId, enabled: true },
      select: { module: true },
    }),
  ]);
  if (!employee) redirect("/login");

  const name = `${employee.firstName} ${employee.lastName}`.trim() || "User";
  const lang = await getLang();
  const enabledModules = tenantModules.map((m) => m.module);

  return (
    <ToastProvider>
      <PWARegister />
      <Shell role={employee.role} name={name} companyName={employee.tenant.name} lang={lang} enabledModules={enabledModules}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
