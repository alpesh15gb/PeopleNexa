import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationsList } from "./notifications-list";
import { recordPageNumber, recordPagination } from "@/lib/document-expense-pagination";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSession();
  const lang = await getLang();
  const requestedPage = recordPageNumber((await searchParams).page) ?? 1;
  const where = { tenantId: session.tenantId, employeeId: session.sub };
  const { notifications, unread, pagination } = await prisma.$transaction(async (tx) => {
    const pagination = recordPagination(await tx.notification.count({ where }), requestedPage);
    const unread = await tx.notification.count({ where: { ...where, isRead: false } });
    const notifications = await tx.notification.findMany({
      where,
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: pagination.offset,
      take: pagination.pageSize,
      select: { id: true, type: true, title: true, message: true, isRead: true, createdAt: true },
    });
    return { notifications, unread, pagination };
  }, { isolationLevel: "RepeatableRead" });

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
      <DocumentExpensePagination path="/notifications" params={{}} pagination={pagination} label="notifications" />
    </div>
  );
}
