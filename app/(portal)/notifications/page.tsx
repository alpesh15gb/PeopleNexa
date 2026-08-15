import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationsList } from "./notifications-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireSession();
  const lang = await getLang();
  const notifications = await prisma.notification.findMany({
    where: { employeeId: session.sub },
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    select: { id: true, type: true, title: true, message: true, isRead: true, createdAt: true },
  });
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t(lang, "notifications.title")}
        description={unread > 0 ? t(lang, "notifications.unread", { n: unread }) : t(lang, "notifications.allCaughtUp")}
      />
      <Card>
        <CardContent className="p-0 pt-0">
          <NotificationsList notifications={notifications} lang={lang} />
        </CardContent>
      </Card>
    </div>
  );
}
