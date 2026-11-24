import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Clock3, DoorOpen, Receipt, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { canOpenApprovals, pendingApprovalFilters } from "@/lib/approval-workspace";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { PriorityApprovals } from "./priority-approvals";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; item?: string | string[]; result?: string | string[] }> }) {
  const query = await searchParams;
  const showAll = query.view === "all";
  const selectedKey = typeof query.item === "string" ? query.item : undefined;
  const result = typeof query.result === "string" ? query.result : undefined;
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
    { title: "Leave requests", href: "/admin/leaves?review=approvals&status=pending", count: leave, icon: CalendarDays },
    { title: "Attendance corrections", href: "/admin/regularization?review=approvals", count: correction, icon: Clock3 },
    { title: "Held punches", href: "/admin/regularization?view=punches", count: heldPunch, icon: ShieldCheck },
    { title: "Expense claims", href: "/admin/expenses?review=approvals", count: expense, icon: Receipt },
    { title: "Exit requests", href: "/admin/exits?review=approvals", count: exit, icon: DoorOpen },
  ].flatMap((queue) => queue.count === null ? [] : [{ ...queue, count: queue.count }]).sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
  const total = queues.reduce((sum, queue) => sum + queue.count, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Approvals"
        description={total > 0 ? `${total.toLocaleString()} ${total === 1 ? "item" : "items"} awaiting review` : undefined}
      />
      {(total > 0 || selectedKey || result) && <PriorityApprovals session={session} modules={modules} filters={filters} selectedKey={selectedKey} result={result} backHref={showAll ? "/admin/approvals?view=all" : "/admin/approvals"} />}
      {total === 0 && <p className="rounded-xl border border-edge bg-card p-5 text-sm text-muted-foreground">{queues.length ? "No requests awaiting your review." : "Your role has no enabled review queues."}</p>}
      {queues.length > 0 && <section aria-labelledby="approval-queues">
        <h2 id="approval-queues" className="mb-3 font-display text-lg font-semibold">Review queues</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {queues.map(({ title, href, count, icon: Icon }) => <li key={href}>
            <Link href={href} className="flex min-h-12 items-center gap-3 rounded-lg border border-edge bg-card px-4 py-2 text-sm hover:bg-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 font-medium">{title}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{count.toLocaleString()} pending</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            </Link>
          </li>)}
        </ul>
      </section>}
    </div>
  );
}
