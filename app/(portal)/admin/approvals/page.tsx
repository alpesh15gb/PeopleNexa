import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Clock3, DoorOpen, Receipt } from "lucide-react";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { canOpenApprovals, pendingApprovalFilters } from "@/lib/approval-workspace";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (!canOpenApprovals(session.role)) redirect("/employee");

  const [access, filters] = await Promise.all([getTenantAccess(session.tenantId), pendingApprovalFilters(session)]);
  if (access.status !== "active" || (access.subscriptionExpiry && access.subscriptionExpiry < new Date())) redirect("/login");

  const modules = access.modules;
  const [leave, correction, expense, exit] = await Promise.all([
    filters.leave && modules.has("leaves") ? prisma.leaveRequest.count({ where: filters.leave }) : null,
    filters.correction && modules.has("attendance") ? prisma.punchCorrection.count({ where: filters.correction }) : null,
    filters.expense && modules.has("expenses") ? prisma.expenseClaim.count({ where: filters.expense }) : null,
    filters.exit && modules.has("exit") ? prisma.exitRequest.count({ where: filters.exit }) : null,
  ]);

  const queues = [
    { title: "Leave requests", description: "Leave applications and cancellations", href: "/admin/leaves?review=approvals&status=pending", count: leave, icon: CalendarDays },
    { title: "Attendance corrections", description: "Requests to correct punch times", href: "/admin/regularization?review=approvals", count: correction, icon: Clock3 },
    { title: "Expense claims", description: "Reimbursement requests", href: "/admin/expenses?review=approvals", count: expense, icon: Receipt },
    { title: "Exit requests", description: "Resignations awaiting a decision", href: "/admin/exits?review=approvals", count: exit, icon: DoorOpen },
  ].flatMap((queue) => queue.count === null ? [] : [{ ...queue, count: queue.count }]);
  const total = queues.reduce((sum, queue) => sum + queue.count, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Approvals"
        description={queues.length ? `${total.toLocaleString()} ${total === 1 ? "request" : "requests"} awaiting your review.` : "Your workspace has no enabled review queues for your role or assignment."}
      />
      {queues.length > 0 && (
        <ul aria-label="Approval queues" className="grid gap-4 md:grid-cols-2">
          {queues.map(({ title, description, href, count, icon: Icon }) => (
            <li key={href}>
              <Card className="h-full overflow-hidden">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                    </div>
                    <span className="shrink-0 text-2xl font-semibold tabular-nums text-foreground" aria-label={`${count} pending`}>{count.toLocaleString()}</span>
                  </div>
                  <Link href={href} className="mt-auto inline-flex min-h-10 w-fit items-center gap-2 rounded-md text-sm font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    {`Review ${title.toLowerCase()}`}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
