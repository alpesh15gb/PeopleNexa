import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isMonthKey, monthKey } from "@/lib/dates";
import { PageHeader } from "@/components/ui/card";
import { CashbookPanel } from "./cashbook-panel";

export const dynamic = "force-dynamic";

// NOTE: Payroll cash payouts do NOT auto-post here by design — this ledger is
// manual-only (PagarBook parity). Payslip payout metadata (paidVia/paidAt)
// stays on the payslip; admins record cash movement explicitly via /api/cashbook.
export default async function AdminCashbookPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const { month: monthParam } = await searchParams;
  const month = monthParam && isMonthKey(monthParam) ? monthParam : monthKey(new Date());

  const [y, m] = month.split("-").map(Number);
  const gte = new Date(y, m - 1, 1);
  const lt = new Date(y, m, 1);

  const entries = await prisma.cashbookEntry.findMany({
    where: { tenantId: session.tenantId, date: { gte, lt } },
    orderBy: { date: "desc" },
    take: 200,
  });

  const cashIn = entries.filter((e) => e.type === "cash_in").reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter((e) => e.type === "cash_out").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Cashbook"
        description="Cash-in / cash-out ledger — daily cashbook in the style of PagarBook"
      />
      <CashbookPanel
        month={month}
        totals={{ cashIn, cashOut, balance: cashIn - cashOut }}
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
    </div>
  );
}
