import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { WebhooksPanel } from "./webhooks-panel";

export const dynamic = "force-dynamic";

export default async function AdminWebhooksPage() {
  const session = await requireSession();
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Webhooks & Integrations"
        description="Send signed, real-time events to your own systems (ERP, WhatsApp, attendance trackers…)"
      />
      <Card>
        <CardContent className="p-0">
          <WebhooksPanel endpoints={endpoints} />
        </CardContent>
      </Card>
    </div>
  );
}
