import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationsList } from "./notifications-list";
import { recordPageNumber, recordPageRedirect, recordPagination } from "@/lib/document-expense-pagination";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { workspaceRegion } from "@/lib/workspace-region";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string; filter?: string }> }) {
  const session = await requireSession();
  const [lang, params, tenant] = await Promise.all([
    getLang(), searchParams, prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const requestedPage = recordPageNumber(params.page) ?? 1;
  const unreadOnly = params.filter === "unread";
  const attentionOnly = params.filter === "attention";
  const where = { tenantId: session.tenantId, employeeId: session.sub };
  const { notifications, unread, pagination } = await prisma.$transaction(async (tx) => {
    const unread = await tx.notification.count({ where: { ...where, isRead: false } });
    const filtered = { ...where, ...(unreadOnly ? { isRead: false } : {}), ...(attentionOnly ? { type: { in: ["danger", "warning"] } } : {}) };
    const pagination = recordPagination(unreadOnly ? unread : await tx.notification.count({ where: filtered }), requestedPage);
    const notifications = await tx.notification.findMany({
      where: filtered,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.offset,
      take: pagination.pageSize,
      select: { id: true, type: true, title: true, message: true, isRead: true, createdAt: true },
    });
    return { notifications, unread, pagination };
  }, { isolationLevel: "RepeatableRead" });
  const canonical = recordPageRedirect("/notifications", params, pagination);
  if (canonical) redirect(canonical);

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t(lang, "notifications.title")}
        description={unread > 0 ? t(lang, "notifications.unread", { n: unread }) : t(lang, "notifications.allCaughtUp")}
      />
      <Card>
        <CardContent className="p-0 pt-0">
          <nav aria-label="Notification filters" className="flex flex-wrap gap-2 border-b border-edge px-4 py-3">
            <Link href="/notifications" aria-current={!unreadOnly && !attentionOnly ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm hover:bg-tint ${!unreadOnly && !attentionOnly ? "bg-tint font-semibold" : ""}`}>All activity</Link>
            <Link href="/notifications?filter=unread" aria-current={unreadOnly ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm hover:bg-tint ${unreadOnly ? "bg-tint font-semibold" : ""}`}>Unread ({unread})</Link>
            <Link href="/notifications?filter=attention" aria-current={attentionOnly ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm hover:bg-tint ${attentionOnly ? "bg-tint font-semibold" : ""}`}>Warnings and alerts</Link>
          </nav>
          <NotificationsList attentionOnly={attentionOnly} notifications={notifications} unread={unread} unreadOnly={unreadOnly} region={workspaceRegion(tenant?.config)} lang={lang} />
        </CardContent>
      </Card>
      <DocumentExpensePagination path="/notifications" params={params} pagination={pagination} label="notifications" />
    </div>
  );
}
