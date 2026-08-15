import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/ui/toast";
import { PWARegister } from "@/components/pwa-register";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    include: { tenant: true },
  });
  if (!employee) redirect("/login");

  const name = `${employee.firstName} ${employee.lastName}`.trim() || "User";
  const lang = await getLang();

  return (
    <ToastProvider>
      <PWARegister />
      <Shell role={employee.role} name={name} companyName={employee.tenant.name} lang={lang}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
