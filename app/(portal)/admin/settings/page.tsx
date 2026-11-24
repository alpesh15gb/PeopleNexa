import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { getEbioserverConfig } from "@/lib/ebioserver";
import { getSmsConfig } from "@/lib/sms";
import { SettingsPanel } from "./settings-panel";
import { SmsPanel } from "./sms-panel";
import { FaceSettingsPanel } from "./face-panel";

export const dynamic = "force-dynamic";

const connections = [
  { id: "device-connection", label: "eBioserver" },
  { id: "face-verification", label: "Face verification" },
  { id: "sms-notifications", label: "SMS notifications" },
] as const;

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const session = await requireActiveSession();
  if (session.role !== "admin") redirect("/admin");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } });

  const { section } = await searchParams;
  const active = connections.find(connection => connection.id === section)?.id ?? connections[0].id;
  const profile = getEbioserverConfig(tenant);
  const sms = getSmsConfig(tenant.config);
  const faceRaw = (tenant.config ?? {}) as { faceMatch?: Partial<{ enabled: boolean; matchThreshold: number; reviewThreshold: number }> };
  const face = {
    enabled: faceRaw.faceMatch?.enabled ?? true,
    matchThreshold:
      typeof faceRaw.faceMatch?.matchThreshold === "number" ? faceRaw.faceMatch.matchThreshold : 0.62,
    reviewThreshold:
      typeof faceRaw.faceMatch?.reviewThreshold === "number" ? faceRaw.faceMatch.reviewThreshold : 0.5,
  };

  return (
    <div className="animate-fade-up space-y-6">
      <Link href="/admin/configuration/company-settings" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Company settings
      </Link>
      <PageHeader
        title="Workspace connections"
        description="Manage eBioserver, face verification and SMS delivery."
      />
      <nav aria-label="Connection settings" className="flex flex-wrap gap-1 border-b border-edge">
        {connections.map(({ id, label }) => (
          <Link key={id} href={id === connections[0].id ? "/admin/settings" : `/admin/settings?section=${id}`} aria-current={active === id ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium hover:bg-tint focus-visible:outline-2 focus-visible:outline-ring ${active === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{label}</Link>
        ))}
      </nav>
      {active === "device-connection" && <section id="device-connection" aria-label="Device connection" className="scroll-mt-24">
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
      </section>}
      {active === "face-verification" && <Card id="face-verification" className="scroll-mt-24">
          <CardContent><FaceSettingsPanel initial={face} /></CardContent>
      </Card>}
      {active === "sms-notifications" && <Card id="sms-notifications" className="scroll-mt-24">
          <CardContent><SmsPanel
            initial={{
              enabled: sms.enabled,
              apiUrl: sms.apiUrl,
              hasToken: Boolean(sms.apiToken),
              sender: sms.sender,
            }}
          /></CardContent>
      </Card>}
    </div>
  );
}
