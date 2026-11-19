import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import { WhatsAppPanel } from "./whatsapp-panel";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/admin");
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const cfg = getWhatsAppConfig(tenant?.config ?? null);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="WhatsApp notifications"
        description="Connect a WhatsApp gateway for leave and exit decisions."
      />
      <Card>
        <CardContent className="p-6">
          <WhatsAppPanel
            initial={{
              enabled: cfg.enabled,
              apiUrl: cfg.apiUrl,
              hasToken: Boolean(cfg.apiToken),
              sender: cfg.sender,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
