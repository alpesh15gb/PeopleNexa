import { requireActiveSession } from "@/lib/session";
import { todayKey } from "@/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { PunchDetailsTable } from "./punch-details-table";
import { MobilePunchesTable } from "./mobile-punches-table";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PunchDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; page?: string; view?: string }>;
}) {
  const session = await requireActiveSession();
  if (!["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) redirect("/employee");
  const p = await searchParams;
  const from = p.from ?? todayKey();
  const to = p.to ?? from;
  const q = p.q ?? "";
  const mobile = p.view === "mobile";
  const page = Math.max(1, Number(p.page ?? 1) || 1);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Punch Details" description={mobile ? "Mobile clock-in and clock-out evidence, including pending and declined punches." : "One attendance line per employee and day, with in and out punches together."} />
      <nav aria-label="Punch report view" className="flex gap-4 text-sm"><Link aria-current={!mobile ? "page" : undefined} className={!mobile ? "font-semibold text-primary" : "text-muted-foreground"} href={`/admin/reports/punch-details?${new URLSearchParams({ from, to })}`}>Daily attendance</Link><Link aria-current={mobile ? "page" : undefined} className={mobile ? "font-semibold text-primary" : "text-muted-foreground"} href={`/admin/reports/punch-details?${new URLSearchParams({ from, to, view: "mobile" })}`}>Mobile punches</Link></nav>
      <Card>
        <CardContent className="p-5">
          <form className="flex flex-wrap items-end gap-3" action="/admin/reports/punch-details" method="get">
            {mobile && <input type="hidden" name="view" value="mobile" />}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From Date</label>
              <input name="from" type="date" defaultValue={from} className="rounded-lg border border-edge bg-card px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">To Date</label>
              <input name="to" type="date" defaultValue={to} className="rounded-lg border border-edge bg-card px-3 py-2 text-sm" />
            </div>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">View</button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          {mobile ? <MobilePunchesTable key={`${from}:${to}`} from={from} to={to} /> : <PunchDetailsTable from={from} to={to} initialQuery={q} initialPage={page} initialSize={50} />}
        </CardContent>
      </Card>
    </div>
  );
}
