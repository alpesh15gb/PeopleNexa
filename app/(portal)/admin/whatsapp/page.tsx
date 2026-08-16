import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import { WhatsAppPanel } from "./whatsapp-panel";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const cfg = getWhatsAppConfig(tenant?.config ?? null);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="WhatsApp notifications"
        description="Send punch, approval and payslip alerts to your team on WhatsApp"
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
