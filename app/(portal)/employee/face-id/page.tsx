import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { faceMatchConfig } from "@/lib/face";
import { PageHeader } from "@/components/ui/card";
import { EnrollPanel } from "./enroll-panel";

export const dynamic = "force-dynamic";

export default async function FaceIdPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const row = await prisma.faceEnrollment.findUnique({
    where: { employeeId: session.sub },
    select: { tenantId: true, sampleCount: true, consentedAt: true },
  });
  const own = row && row.tenantId === session.tenantId ? row : null;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Face ID"
        description="Enroll three selfies to clock in with face match. Re-enroll anytime to replace your templates, or withdraw consent to delete them."
      />
      <EnrollPanel
        initial={{
          status: own ? "enrolled" : "none",
          sampleCount: own?.sampleCount ?? 0,
          consentedAt: own?.consentedAt ? own.consentedAt.toISOString() : null,
        }}
        consentVersion={faceMatchConfig.consentVersion}
      />
    </div>
  );
}
