import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Clock3, DoorOpen, Receipt, ShieldCheck } from "lucide-react";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { canOpenApprovals, pendingApprovalFilters } from "@/lib/approval-workspace";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const showAll = (await searchParams).view === "all";
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (!canOpenApprovals(session.role)) redirect("/employee");

  const [access, filters] = await Promise.all([getTenantAccess(session.tenantId), pendingApprovalFilters(session)]);
  if (access.status !== "active" || (access.subscriptionExpiry && access.subscriptionExpiry < new Date())) redirect("/login");

  const modules = access.modules;
  const [leave, correction, heldPunch, expense, exit] = await Promise.all([
    filters.leave && modules.has("leaves") ? prisma.leaveRequest.count({ where: filters.leave }) : null,
    filters.correction && modules.has("attendance") ? prisma.punchCorrection.count({ where: filters.correction }) : null,
    filters.heldPunch && modules.has("attendance") ? prisma.punch.count({ where: filters.heldPunch }) : null,
    filters.expense && modules.has("expenses") ? prisma.expenseClaim.count({ where: filters.expense }) : null,
    filters.exit && modules.has("exit") ? prisma.exitRequest.count({ where: filters.exit }) : null,
  ]);

  const queues = [
    { title: "Leave requests", description: "Leave applications and cancellations", href: "/admin/leaves?review=approvals&status=pending", count: leave, icon: CalendarDays },
    { title: "Attendance corrections", description: "Requests to correct punch times", href: "/admin/regularization?review=approvals", count: correction, icon: Clock3 },
    { title: "Held punches", description: "Mobile clock attempts awaiting verification", href: "/admin/regularization?view=punches", count: heldPunch, icon: ShieldCheck },
    { title: "Expense claims", description: "Reimbursement requests", href: "/admin/expenses?review=approvals", count: expense, icon: Receipt },
    { title: "Exit requests", description: "Resignations awaiting a decision", href: "/admin/exits?review=approvals", count: exit, icon: DoorOpen },
  ].flatMap((queue) => queue.count === null ? [] : [{ ...queue, count: queue.count }]).sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
  const total = queues.reduce((sum, queue) => sum + queue.count, 0);
  const pendingQueues = queues.filter(({ count }) => count > 0);
  const visible = showAll ? queues : pendingQueues;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Approvals"
        description={queues.length ? `${total.toLocaleString()} ${total === 1 ? "item" : "items"} awaiting your review.` : "Your workspace has no enabled review queues for your role or assignment."}
      />
      {queues.length > 0 && (
        <nav aria-label="Approval views" className="flex gap-2 border-b border-edge pb-3">
          {[
            { label: `Needs review (${total})`, href: "/admin/approvals", selected: !showAll },
            { label: `All queues (${queues.length})`, href: "/admin/approvals?view=all", selected: showAll },
          ].map(({ href, label, selected }) => <Link key={href} href={href} aria-current={selected ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-tint ${selected ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>{label}</Link>)}
        </nav>
      )}
      {queues.length > 0 && !visible.length && <div className="rounded-xl border border-edge bg-card p-6"><h2 className="font-semibold">You’re caught up</h2><p className="mt-1 text-sm text-muted-foreground">New requests from your review queues will appear here.</p></div>}
      {visible.length > 0 && (
        <ul aria-label="Approval queues" className="grid gap-4 md:grid-cols-2">
          {visible.map(({ title, description, href, count, icon: Icon }) => (
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
