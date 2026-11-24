import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { getSession } from "@/lib/session";
import { getLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { getTenantAccess } from "@/lib/modules-server";
import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/ui/toast";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [employee, access] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      include: { tenant: true },
    }),
    getTenantAccess(session.tenantId),
  ]);
  // Inactive / deleted employees must not retain portal access (tokens live 30d).
  if (!employee || employee.status !== "active") redirect("/login");

  if (employee.mustChangePassword) redirect("/change-password");

  const name = `${employee.firstName} ${employee.lastName}`.trim() || "User";
  const lang = await getLang();
  const enabledModules = [...access.modules];

  return (
    <ToastProvider>
      <Shell role={employee.role} name={name} companyName={employee.tenant.name} lang={lang} enabledModules={enabledModules} loginOnly={employee.loginOnly}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
