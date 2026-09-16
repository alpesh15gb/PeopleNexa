import { requireSession } from "@/lib/session";
import { todayKey } from "@/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { PunchDetailsTable } from "./punch-details-table";

export const dynamic = "force-dynamic";

export default async function PunchDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; page?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from ?? todayKey();
  const to = p.to ?? from;
  const q = p.q ?? "";
  const page = Math.max(1, Number(p.page ?? 1) || 1);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Punch Details" description="Raw biometric punches with the source machine." />
      <Card>
        <CardContent className="p-5">
          <form className="flex flex-wrap items-end gap-3" action="/admin/reports/punch-details" method="get">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From Date</label>
              <input name="from" type="date" defaultValue={from} className="rounded-lg border border-edge bg-card px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">To Date</label>
              <input name="to" type="date" defaultValue={to} className="rounded-lg border border-edge bg-card px-3 py-2 text-sm" />
            </div>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white" type="submit">View</button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <PunchDetailsTable from={from} to={to} initialQuery={q} initialPage={page} initialSize={50} />
        </CardContent>
      </Card>
    </div>
  );
}
