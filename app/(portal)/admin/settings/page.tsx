import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { getEbioserverConfig } from "@/lib/ebioserver";
import { getSmsConfig } from "@/lib/sms";
import { SettingsPanel } from "./settings-panel";
import { SmsPanel } from "./sms-panel";
import { FaceSettingsPanel } from "./face-panel";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return null;

  const profile = getEbioserverConfig(tenant);
  const sms = getSmsConfig(tenant?.config ?? null);
  const faceRaw = (tenant?.config ?? {}) as { faceMatch?: Partial<{ enabled: boolean; matchThreshold: number; reviewThreshold: number }> };
  const face = {
    enabled: faceRaw.faceMatch?.enabled ?? true,
    matchThreshold:
      typeof faceRaw.faceMatch?.matchThreshold === "number" ? faceRaw.faceMatch.matchThreshold : 0.62,
    reviewThreshold:
      typeof faceRaw.faceMatch?.reviewThreshold === "number" ? faceRaw.faceMatch.reviewThreshold : 0.5,
  };

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
      <Card>
        <CardContent className="p-6">
          <FaceSettingsPanel initial={face} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <SmsPanel
            initial={{
              enabled: sms.enabled,
              apiUrl: sms.apiUrl,
              hasToken: Boolean(sms.apiToken),
              sender: sms.sender,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
