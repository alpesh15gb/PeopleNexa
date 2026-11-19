import Link from "next/link";
import { ArrowUpRight, BarChart3, CalendarClock, CalendarDays, FileSpreadsheet, Fingerprint, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/card";

const attendanceReports = [
  { href: "/admin/reports?type=device-daily", title: "Daily attendance", description: "See punches, status and hours for a selected date.", icon: CalendarClock },
  { href: "/admin/reports?type=device-monthly", title: "Monthly attendance", description: "Review daily records for each employee in a month.", icon: CalendarDays },
  { href: "/admin/reports?type=device-status-matrix", title: "Attendance matrix", description: "Compare daily statuses across employees.", icon: FileSpreadsheet },
  { href: "/admin/reports?type=device-work-summary", title: "Work hours", description: "Summarize recorded working time for a month.", icon: BarChart3 },
  { href: "/admin/reports?type=device-performance", title: "Attendance performance", description: "Compare attendance outcomes over a month.", icon: BarChart3 },
  { href: "/admin/reports/punch-details", title: "Punch logs", description: "Inspect the original records behind attendance.", icon: Fingerprint },
];

export function ReportLibrary({ attendance, people, payroll }: { attendance: boolean; people: boolean; payroll: boolean }) {
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
  return (
    <div className="space-y-8">
      <PageHeader title="Report library" description="Open a report for attendance, people, or payroll." />
      {groups.filter(({ reports }) => reports.length > 0).map(({ title, reports }) => (
        <section key={title} className="space-y-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reports.map(({ href, title, description, icon: Icon }) => (
              <Link key={href} href={href} className="group flex items-start gap-3 rounded-xl border border-edge bg-card p-4 outline-none hover:border-primary/40 hover:bg-tint focus-visible:ring-2 focus-visible:ring-ring">
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon aria-hidden="true" className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
                <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      {groups.every(({ reports }) => reports.length === 0) && <p className="rounded-xl border border-edge bg-card p-5 text-sm text-muted-foreground">No reports are available for the modules enabled in this workspace.</p>}
    </div>
  );
}
