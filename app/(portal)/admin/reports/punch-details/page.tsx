import { requireActiveSession } from "@/lib/session";
import { isDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { recordPageNumber } from "@/lib/document-expense-pagination";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { PunchDetailsTable } from "./punch-details-table";
import { MobilePunchesTable } from "./mobile-punches-table";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PunchDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; page?: string; view?: string; approval?: string; size?: string }>;
}) {
  const session = await requireActiveSession();
  if (!["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) redirect("/employee");
  const [p, tenant] = await Promise.all([searchParams, prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } })]);
  const region = workspaceRegion(tenant?.config);
  const defaultDate = dateKeyInTimeZone(new Date(), region.timeZone);
  const from = typeof p.from === "string" && isDateKey(p.from) ? p.from : defaultDate;
  const to = typeof p.to === "string" && isDateKey(p.to) ? p.to : from;
  const q = typeof p.q === "string" ? p.q.trim().slice(0, 100) : "";
  const mobile = p.view === "mobile";
  const page = recordPageNumber(p.page) ?? 1;
  const size = [50, 100, 200, 500].includes(Number(p.size)) ? Number(p.size) : 50;
  const approval = typeof p.approval === "string" && ["auto", "pending", "approved", "declined"].includes(p.approval) ? p.approval : "";
  const rangeError = to < from || (Date.parse(to) - Date.parse(from)) / 86400000 >= 93;
  const href = (view: "daily" | "mobile") => `/admin/reports/punch-details?${new URLSearchParams({ from, to, ...(q && { q }), ...(size !== 50 && { size: String(size) }), ...(view === "mobile" && { view, ...(approval && { approval }) }) })}`;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Punch details" description={`${mobile ? "Mobile clock-in and clock-out evidence" : "Daily in and out punches by employee"} · ${region.timeZone}`} actions={<Link href="/admin/reports" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Report library</Link>} />
      <nav aria-label="Punch report view" className="flex flex-wrap gap-4 border-b border-edge text-sm">
        <Link aria-current={!mobile ? "page" : undefined} className={`py-3 ${!mobile ? "font-semibold text-primary" : "text-muted-foreground"}`} href={href("daily")}>Daily attendance</Link>
        <Link aria-current={mobile ? "page" : undefined} className={`py-3 ${mobile ? "font-semibold text-primary" : "text-muted-foreground"}`} href={href("mobile")}>Mobile punches</Link>
      </nav>
      <Card><CardContent>
        <form key={`${mobile}|${from}|${to}|${q}|${approval}|${size}`} className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,10rem)_auto] items-end" action="/admin/reports/punch-details" method="get">
          {mobile && <input type="hidden" name="view" value="mobile" />}
          <Field label="From date"><Input name="from" type="date" defaultValue={from} required /></Field>
          <Field label="To date"><Input name="to" type="date" defaultValue={to} required /></Field>
          <Field label="Employee name or code"><Input name="q" type="search" defaultValue={q} maxLength={100} /></Field>
          {mobile ? <Field label="Approval status"><Select name="approval" defaultValue={approval}><option value="">All statuses</option>{["auto", "pending", "approved", "declined"].map((status) => <option value={status} key={status}>{status === "auto" ? "Auto accepted" : status[0].toUpperCase() + status.slice(1)}</option>)}</Select></Field>
            : <Field label="Rows per page"><Select name="size" defaultValue={String(size)}>{[50, 100, 200, 500].map((rowCount) => <option key={rowCount} value={rowCount}>{rowCount}</option>)}</Select></Field>}
          <Button type="submit">View report</Button>
        </form>
        {rangeError && <p role="alert" className="mt-3 text-sm text-destructive">Select a start and end date within a 93-day range.</p>}
      </CardContent></Card>
      {!rangeError && <Card><CardContent className="min-w-0 p-3 sm:p-5">
        {mobile ? <MobilePunchesTable from={from} to={to} query={q} approval={approval} requestedPage={page} region={region} />
          : <PunchDetailsTable from={from} to={to} query={q} requestedPage={page} size={size} region={region} />}
      </CardContent></Card>}
    </div>
  );
}
