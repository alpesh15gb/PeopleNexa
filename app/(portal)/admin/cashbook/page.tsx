import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/session";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui/card";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { managerLocationId } from "@/lib/location-scope";
import { cashbookRecords } from "@/lib/cashbook-records";
import { recordPageNumber, recordPageRedirect, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { CashbookPanel } from "./cashbook-panel";

export const dynamic = "force-dynamic";

// NOTE: Payroll cash payouts do NOT auto-post here by design — this ledger is
// manual-only (PagarBook parity). Payslip payout metadata (paidVia/paidAt)
// stays on the payslip; admins record cash movement explicitly via /api/cashbook.
export default async function AdminCashbookPage({
  searchParams,
}: {
  searchParams: Promise<RecordSearchParams>;
}) {
  const [session, params] = await Promise.all([requireActiveSession(), searchParams]);
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee");
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) {
    return <PageHeader title="Cashbook" description="Ask a workspace administrator to assign a location to your account." />;
  }
  const month = typeof params.month === "string" && isMonthKey(params.month) ? params.month : monthKeyIST();
  const { entries, summary, pagination } = await cashbookRecords(session.tenantId, locationId, month, recordPageNumber(params.page) ?? 1);
  const path = "/admin/cashbook";
  const redirectTo = recordPageRedirect(path, { ...params, month }, pagination);
  if (redirectTo) redirect(redirectTo);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Cashbook"
        description="Record cash movements and reconcile monthly totals."
      />
      <CashbookPanel
        month={month}
        totals={summary}
        totalEntries={pagination.total}
        entries={entries.map((e) => ({
          id: e.id,
          date: e.date.toISOString(),
          type: e.type,
          category: e.category,
          amount: e.amount,
          note: e.note,
          paymentMode: e.paymentMode,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
      <DocumentExpensePagination path={path} params={{ ...params, month }} pagination={pagination} label="entries" />
    </div>
  );
}
