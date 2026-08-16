import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SuperadminShell } from "@/components/superadmin-shell";

export default async function SuperadminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") redirect("/superadmin/login");

  const sa = await prisma.superAdmin.findUnique({ where: { id: session.sub } });
  if (!sa) redirect("/superadmin/login");

  return <SuperadminShell name={sa.name ?? sa.email}>{children}</SuperadminShell>;
}
