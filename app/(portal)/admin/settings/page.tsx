import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { getEbioserverConfig } from "@/lib/ebioserver";
import { SettingsPanel } from "./settings-panel";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return null;

  const profile = getEbioserverConfig(tenant);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Settings"
        description="Biometric device connections — each workspace can run its own eBioserver"
      />
      <SettingsPanel
        initial={{
          url: profile.url,
          username: profile.username,
          hasPassword: Boolean(profile.passwordEnc),
          enabled: profile.enabled,
          pollIntervalMinutes: profile.pollIntervalMinutes,
          lastPulledAt: profile.lastPulledAt,
          lastError: profile.lastError,
          lastErrorAt: profile.lastErrorAt,
        }}
      />
    </div>
  );
}
