import Link from "next/link";
import { ArrowUpRight, BarChart3, CalendarClock, CalendarDays, FileSpreadsheet, Fingerprint, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/card";

const attendanceReports = [
  { href: "/admin/reports?type=device-daily", title: "Daily attendance", description: "See punches, status and hours for a selected date.", icon: CalendarClock },
  { href: "/admin/reports?type=device-monthly", title: "Monthly attendance", description: "Review daily records for each employee in a month.", icon: CalendarDays },
  { href: "/admin/reports?type=device-status-matrix", title: "Attendance matrix", description: "Compare daily statuses across employees.", icon: FileSpreadsheet },
  { href: "/admin/reports?type=device-work-summary", title: "Work hours", description: "Summarize recorded working time for a month.", icon: BarChart3 },
  { href: "/admin/reports?type=device-performance", title: "Attendance performance", description: "Compare attendance outcomes over a month.", icon: BarChart3 },
  { href: "/admin/reports/punch-details", title: "Punch logs", description: "Inspect the original records behind attendance.", icon: Fingerprint },
];

export function ReportLibrary({ attendance, people, payroll, query }: { attendance: boolean; people: boolean; payroll: boolean; query: string }) {
  const groups = [
    { title: "Attendance", reports: attendance ? attendanceReports : [] },
    { title: "People", reports: people ? [
      { href: "/admin/reports?type=workforce-movement", title: "Workforce movement", description: "Track joiners and completed exits over six months.", icon: Users },
      { href: "/admin/reports?type=inactive-employees", title: "Inactive employees", description: "Find and export employees who are marked inactive.", icon: Users },
    ] : [] },
    { title: "Pay and compensation", reports: payroll ? [
      { href: "/admin/payroll/variance", title: "Payroll history", description: "Review payroll runs and compare period totals.", icon: FileSpreadsheet },
    ] : [] },
  ];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visibleGroups = groups.map(({ title, reports }) => ({
    title,
    reports: reports.filter(report => terms.every(term => `${title} ${report.title} ${report.description}`.toLowerCase().includes(term))),
  })).filter(group => group.reports.length > 0);
  return (
    <div className="space-y-8">
      <PageHeader title="Report library" />
      {groups.some(group => group.reports.length > 0) && <form action="/admin/reports" className="flex flex-wrap items-end gap-2 rounded-xl border border-edge bg-card p-4">
        <label className="w-full sm:max-w-sm"><span className="mb-1 block text-xs font-semibold">Find a report</span>
          <Input key={query} name="q" type="search" defaultValue={query} maxLength={80} placeholder="Daily attendance, work hours, payroll…" />
        </label>
        <Button type="submit">Search</Button>
        {query && <Link href="/admin/reports" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary hover:underline">Clear</Link>}
      </form>}
      {visibleGroups.map(({ title, reports }) => (
        <section key={title} className="space-y-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <div className="divide-y divide-edge rounded-xl border border-edge bg-card">
            {reports.map(({ href, title, description, icon: Icon }) => (
              <Link key={href} href={href} className="group flex items-start gap-3 rounded-lg px-4 py-3 outline-none hover:bg-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon aria-hidden="true" className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
                <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      {visibleGroups.length === 0 && <p className="rounded-xl border border-edge bg-card p-5 text-sm text-muted-foreground">{query ? "No available reports match your search." : "No reports are available for the modules enabled in this workspace."}</p>}
    </div>
  );
}
