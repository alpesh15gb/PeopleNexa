import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { faceMatchConfig } from "@/lib/face";
import { PageHeader } from "@/components/ui/card";
import { EnrollPanel } from "./enroll-panel";

export const dynamic = "force-dynamic";

export default async function FaceIdPage() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");

  const [row, employee] = await Promise.all([
    prisma.faceEnrollment.findFirst({ where: { employeeId: session.sub, tenantId: session.tenantId }, select: { sampleCount: true, consentedAt: true } }),
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { loginOnly: true, tenant: { select: { config: true } } } }),
  ]);
  const own = row;
  const config = employee?.tenant.config as { faceMatch?: { enabled?: boolean } } | null;
  const canEnroll = Boolean(employee && !employee.loginOnly && config?.faceMatch?.enabled !== false);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Face ID"
        description="Manage voluntary face matching for mobile attendance."
        actions={<Link href="/employee/attendance?view=today" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">My attendance</Link>}
      />
      <EnrollPanel
        initial={{
          status: own ? "enrolled" : "none",
          sampleCount: own?.sampleCount ?? 0,
          consentedAt: own?.consentedAt ? own.consentedAt.toISOString() : null,
        }}
        canEnroll={canEnroll}
        consentVersion={faceMatchConfig.consentVersion}
      />
    </div>
  );
}
